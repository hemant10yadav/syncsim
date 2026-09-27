// Public API of the sync engine. Nothing here may depend on the DOM or on React,
// so the engine can be tested in isolation and published on its own later.

export const ENGINE_VERSION = '0.0.0';

export { compareTimestamps, HybridClock } from './hlc';
export type { Timestamp } from './hlc';
export { Replica } from './replica';
export type {
  FieldName,
  FieldValue,
  NodeId,
  OpId,
  Operation,
  RecordId,
  RecordState,
  Snapshot,
  VersionVector,
} from './types';
