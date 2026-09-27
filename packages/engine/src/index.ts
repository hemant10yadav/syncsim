// Public API of the sync engine. Nothing here may depend on the DOM or on React,
// so the engine can be tested in isolation and published on its own later.

export const ENGINE_VERSION = '0.0.0';

export { counterValue, liveAdds, orSetElements } from './crdt';
export type { IncrementOperation, SetElementOperation } from './crdt';
export { compareTimestamps, HybridClock } from './hlc';
export type { Timestamp } from './hlc';
export { REGISTER_STRATEGIES, standingWrites, unreplaced } from './registers';
export type { RegisterStrategy, SetOperation } from './registers';
export { Replica } from './replica';
export type { ReplicaOptions } from './replica';
export { createRng } from './rng';
export type { Rng } from './rng';
export { PERFECT_NETWORK, Simulation } from './simulation';
export type {
  DeviceSpec,
  DropReason,
  Message,
  NetworkConditions,
  Payload,
  SettleResult,
  SimEvent,
  SimulationOptions,
} from './simulation';
export { pull, syncPair } from './sync';
export type {
  Change,
  ChangeType,
  Conflict,
  FieldKind,
  FieldName,
  FieldValue,
  NodeId,
  OpId,
  Operation,
  RecordId,
  RecordState,
  Schema,
  Snapshot,
  VersionVector,
} from './types';
