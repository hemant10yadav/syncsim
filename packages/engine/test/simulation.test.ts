import { describe, expect, it } from 'vitest';
import { Simulation, type SimEvent, type SimulationOptions } from '../src/simulation';

const devices = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];

function sim(options: Partial<SimulationOptions> = {}) {
  return new Simulation({ seed: 1, devices, network: { minLatencyMs: 100, maxLatencyMs: 100 }, ...options });
}

const ofKind = <K extends SimEvent['kind']>(events: readonly SimEvent[], kind: K) =>
  events.filter((e): e is Extract<SimEvent, { kind: K }> => e.kind === kind);

describe('Simulation', () => {
  it('delivers a pull only after the request and the response have both crossed the network', () => {
    const s = sim();
    s.edit('a', 'case-1', 'name', 'Asha');
    s.requestSync('b', 'a');
    s.advance(199);
    expect(s.replica('b').read('case-1')).toBeUndefined();
    s.advance(1);
    expect(s.replica('b').read('case-1')).toEqual({ name: 'Asha' });
    expect(s.inFlight()).toEqual([]);
  });

  it('sends nothing to an offline device, then catches it up once it is back', () => {
    const s = sim();
    s.setOnline('b', false);
    s.edit('a', 'case-1', 'visits', 1);
    s.gossip();
    s.advance(500);
    expect(s.replica('b').read('case-1')).toBeUndefined();
    expect(ofKind(s.events, 'drop').every((e) => e.reason === 'offline')).toBe(true);

    s.setOnline('b', true);
    expect(s.settle().converged).toBe(true);
    expect(s.replica('b').read('case-1')).toEqual({ visits: 1 });
  });

  it('loses a message that is in the air when its recipient goes offline', () => {
    const s = sim();
    s.requestSync('b', 'a');
    s.advance(50);
    s.setOnline('a', false);
    s.advance(100);
    expect(ofKind(s.events, 'deliver')).toEqual([]);
    expect(ofKind(s.events, 'drop').map((e) => e.reason)).toEqual(['offline']);
  });

  it('keeps each side of a partition consistent internally, and merges them after healing', () => {
    const s = sim();
    s.partition([['a', 'b'], ['c']]);
    s.edit('a', 'case-1', 'status', 'open');
    s.advance(10);
    s.edit('c', 'case-1', 'status', 'closed');

    expect(s.settle(5).converged).toBe(false);
    expect(s.replica('b').read('case-1')).toEqual({ status: 'open' });
    expect(s.replica('c').read('case-1')).toEqual({ status: 'closed' });

    s.heal();
    expect(s.settle().converged).toBe(true);
    for (const node of s.nodes()) expect(s.replica(node).read('case-1')).toEqual({ status: 'closed' });
  });

  it('cuts off devices left out of every partition group', () => {
    const s = sim();
    s.partition([['a', 'b']]);
    s.requestSync('c', 'a');
    expect(ofKind(s.events, 'drop').map((e) => e.reason)).toEqual(['partitioned']);
  });

  it('delivers nothing when every message is lost', () => {
    const s = sim({ network: { dropRate: 1 } });
    s.edit('a', 'case-1', 'name', 'Asha');
    s.gossip();
    s.advance(1_000);
    expect(ofKind(s.events, 'deliver')).toEqual([]);
    expect(ofKind(s.events, 'drop').every((e) => e.reason === 'lost')).toBe(true);
    expect(s.replica('b').read('case-1')).toBeUndefined();
  });

  it('applies each op once even when every message arrives twice', () => {
    const s = sim({ network: { duplicateRate: 1, minLatencyMs: 10, maxLatencyMs: 90 } });
    s.edit('a', 'case-1', 'visits', 1);
    s.requestSync('b', 'a');
    s.advance(1_000);
    const responses = ofKind(s.events, 'deliver').filter((e) => e.message.payload.kind === 'sync-response');
    const appliedCounts = responses.map((e) => e.applied.length).sort();
    // Two requests arrive, each triggers a response that is itself duplicated.
    expect(responses).toHaveLength(4);
    expect(appliedCounts).toEqual([0, 0, 0, 1]);
    expect(s.replica('b').read('case-1')).toEqual({ visits: 1 });
  });

  it('replays the exact same event log for the same seed', () => {
    const run = (seed: number) => {
      const s = new Simulation({
        seed,
        devices: [{ id: 'a' }, { id: 'b', clockSkewMs: 60_000 }, { id: 'c' }],
        network: { minLatencyMs: 0, maxLatencyMs: 500, dropRate: 0.3, duplicateRate: 0.3 },
      });
      s.edit('a', 'case-1', 'name', 'Asha');
      s.edit('b', 'case-1', 'name', 'Asha K.');
      s.edit('c', 'case-1', 'visits', 2);
      for (let i = 0; i < 5; i++) {
        s.gossip();
        s.advance(300);
      }
      return s.events;
    };
    expect(run(42)).toEqual(run(42));
    expect(run(42)).not.toEqual(run(43));
  });

  it('rejects impossible network conditions', () => {
    expect(() => sim({ network: { minLatencyMs: 200, maxLatencyMs: 100 } })).toThrow(RangeError);
    expect(() => sim().setConditions({ dropRate: 1.5 })).toThrow(RangeError);
    expect(() => sim().advance(-1)).toThrow(RangeError);
  });

  it('rejects unknown and duplicate devices', () => {
    expect(() => new Simulation({ seed: 1, devices: [{ id: 'a' }, { id: 'a' }] })).toThrow(/Duplicate/);
    expect(() => sim().setOnline('zz', false)).toThrow(/Unknown/);
    expect(() => sim().partition([['a'], ['a', 'b']])).toThrow(/more than one group/);
  });
});
