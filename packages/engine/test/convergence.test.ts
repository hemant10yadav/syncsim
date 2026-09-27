import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { Replica } from '../src/replica';
import { pull, syncPair } from '../src/sync';

const NODES = ['a', 'b', 'c'] as const;
const nodeIndex = fc.integer({ min: 0, max: NODES.length - 1 });

const edit = fc.record({
  kind: fc.constant('edit' as const),
  node: nodeIndex,
  record: fc.constantFrom('case-1', 'case-2'),
  field: fc.constantFrom('name', 'status', 'visits'),
  value: fc.oneof(fc.integer({ min: 0, max: 9 }), fc.constantFrom('open', 'closed'), fc.constant(null)),
});
const partialPull = fc.record({
  kind: fc.constant('pull' as const),
  to: nodeIndex,
  from: nodeIndex,
});
const passTime = fc.record({
  kind: fc.constant('wait' as const),
  ms: fc.integer({ min: 0, max: 5_000 }),
});
const command = fc.oneof(edit, partialPull, passTime);

describe('convergence', () => {
  it('every device ends with identical data once all ops are exchanged, whatever the edits, sync order and clock skew', () => {
    fc.assert(
      fc.property(
        fc.array(command, { minLength: 10, maxLength: 80, size: 'max' }),
        fc.tuple(...NODES.map(() => fc.integer({ min: -3_600_000, max: 3_600_000 }))),
        (commands, skews) => {
          let t = 0;
          const replicas = NODES.map((node, i) => new Replica(node, () => t + skews[i]!));

          for (const cmd of commands) {
            if (cmd.kind === 'edit') replicas[cmd.node]!.set(cmd.record, cmd.field, cmd.value);
            else if (cmd.kind === 'pull') pull(replicas[cmd.to]!, replicas[cmd.from]!);
            else t += cmd.ms;
          }

          // Quiesce: a full round of pairwise syncs delivers everything to everyone.
          for (const a of replicas) for (const b of replicas) if (a !== b) syncPair(a, b);

          const [first, ...rest] = replicas;
          for (const r of rest) {
            expect(r.snapshot()).toEqual(first!.snapshot());
            expect(r.versionVector()).toEqual(first!.versionVector());
          }
        },
      ),
      { numRuns: 500 },
    );
  });
});
