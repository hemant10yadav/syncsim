import type { RegisterStrategy } from '@syncsim/engine'
import type { FieldMode } from './world'

export const STRATEGY_INFO: Record<RegisterStrategy, { label: string; note: string }> = {
  'lww-wall': {
    label: 'Device clock wins',
    note: 'Latest device clock wins. Set a phone’s clock 1 h fast and its old edits beat newer ones.',
  },
  'lww-hlc': {
    label: 'Logical clock wins',
    note: 'An edit made after seeing another one wins. Truly concurrent edits: one is silently dropped.',
  },
  'multi-value': {
    label: 'Keep conflicts',
    note: 'Concurrent edits are all kept and shown as a conflict until someone picks one.',
  },
}

export const MODE_INFO: Record<FieldMode, { label: string; note: string }> = {
  plain: {
    label: 'Plain values',
    note: 'Visits and tags are read, changed and written back, like a typical app. Concurrent edits overwrite each other.',
  },
  crdt: {
    label: 'CRDTs',
    note: 'Visits is a counter and tags a set. Concurrent edits all survive.',
  },
}
