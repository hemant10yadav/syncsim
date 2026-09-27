import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { REGISTER_STRATEGIES } from '../src/registers';
import { Simulation } from '../src/simulation';

const NODES = ['a', 'b', 'c'] as const;
const node = fc.constantFrom(...NODES);
const record = fc.constantFrom('case-1', 'case-2');
const tag = fc.constantFrom('urgent', 'followup', 'referred');
const strategy = fc.constantFrom(...REGISTER_STRATEGIES);

const command = fc.oneof(
  fc.record({
    kind: fc.constant('edit' as const),
    node,
    record,
    field: fc.constantFrom('name', 'status'),
    value: fc.oneof(fc.integer({ min: 0, max: 9 }), fc.constantFrom('open', 'closed')),
  }),
  fc.record({ kind: fc.constant('visit' as const), node, record, by: fc.integer({ min: -2, max: 3 }) }),
  fc.record({ kind: fc.constant('tag' as const), node, record, tag, add: fc.boolean() }),
  fc.record({ kind: fc.constant('strategy' as const), strategy }),
  fc.record({ kind: fc.constant('gossip' as const) }),
  fc.record({ kind: fc.constant('pull' as const), requester: node, peer: node }),
  fc.record({ kind: fc.constant('wait' as const), ms: fc.integer({ min: 0, max: 3_000 }) }),
  fc.record({ kind: fc.constant('online' as const), node, online: fc.boolean() }),
  fc.record({
    kind: fc.constant('partition' as const),
    sides: fc.tuple(...NODES.map(() => fc.integer({ min: 0, max: 1 }))),
  }),
  fc.record({ kind: fc.constant('heal' as const) }),
);

const network = fc.record({
  minLatencyMs: fc.integer({ min: 0, max: 200 }),
  extraLatencyMs: fc.integer({ min: 0, max: 2_000 }),
  dropRate: fc.double({ min: 0, max: 0.3, noNaN: true }),
  duplicateRate: fc.double({ min: 0, max: 0.3, noNaN: true }),
});

describe('convergence over an unreliable network', () => {
  it('every device ends identical once the network heals, despite loss, duplication, reordering, partitions and clock skew', () => {
    // Counters must also keep every increment ever made, on every device.
    fc.assert(
      fc.property(
        fc.integer(),
        network,
        fc.tuple(...NODES.map(() => fc.integer({ min: -3_600_000, max: 3_600_000 }))),
        strategy,
        fc.array(command, { minLength: 10, maxLength: 80, size: 'max' }),
        (seed, net, skews, registers, commands) => {
          const s = new Simulation({
            seed,
            devices: NODES.map((id, i) => ({ id, clockSkewMs: skews[i] })),
            network: {
              minLatencyMs: net.minLatencyMs,
              maxLatencyMs: net.minLatencyMs + net.extraLatencyMs,
              dropRate: net.dropRate,
              duplicateRate: net.duplicateRate,
            },
            schema: { visits: 'counter', tags: 'set' },
            registers,
          });
          const expectedVisits = new Map<string, number>();

          for (const cmd of commands) {
            switch (cmd.kind) {
              case 'edit':
                s.edit(cmd.node, cmd.record, cmd.field, cmd.value);
                break;
              case 'visit':
                s.increment(cmd.node, cmd.record, 'visits', cmd.by);
                expectedVisits.set(cmd.record, (expectedVisits.get(cmd.record) ?? 0) + cmd.by);
                break;
              case 'tag':
                if (cmd.add) s.addElement(cmd.node, cmd.record, 'tags', cmd.tag);
                else s.removeElement(cmd.node, cmd.record, 'tags', cmd.tag);
                break;
              case 'strategy':
                s.setRegisterStrategy(cmd.strategy);
                break;
              case 'gossip':
                s.gossip();
                break;
              case 'pull':
                if (cmd.requester !== cmd.peer) s.requestSync(cmd.requester, cmd.peer);
                break;
              case 'wait':
                s.advance(cmd.ms);
                break;
              case 'online':
                s.setOnline(cmd.node, cmd.online);
                break;
              case 'partition':
                s.partition([0, 1].map((side) => NODES.filter((_, i) => cmd.sides[i] === side)));
                break;
              case 'heal':
                s.heal();
                break;
            }
          }

          s.heal();
          for (const id of NODES) s.setOnline(id, true);
          // The network stays lossy; settling relies on retries alone.
          expect(s.settle(200).converged).toBe(true);

          const [first, ...rest] = NODES.map((id) => s.replica(id));
          for (const replica of rest) {
            expect(replica.snapshot()).toEqual(first!.snapshot());
            expect(replica.conflicts()).toEqual(first!.conflicts());
          }
          for (const [rec, total] of expectedVisits) {
            for (const id of NODES) expect(s.replica(id).value(rec, 'visits')).toBe(total);
          }
        },
      ),
      { numRuns: 200 },
    );
  });
});
