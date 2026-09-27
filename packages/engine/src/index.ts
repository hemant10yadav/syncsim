// Public API of the sync engine. Nothing here may depend on the DOM or on React,
// so the engine can be tested in isolation and published on its own later.

export const ENGINE_VERSION = '0.0.0';

export { compareTimestamps, HybridClock } from './hlc';
export type { Timestamp } from './hlc';
export type { NodeId } from './types';
