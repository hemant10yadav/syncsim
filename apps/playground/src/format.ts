import type { FieldValue, Operation } from '@syncsim/engine'

/** A device clock reading in ms as h:mm:ss.s, with a minus sign for readings before zero. */
export function formatClock(ms: number): string {
  const sign = ms < 0 ? '−' : ''
  const total = Math.abs(ms) / 1000
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = (total % 60).toFixed(1).padStart(4, '0')
  return `${sign}${h}:${String(m).padStart(2, '0')}:${s}`
}

/** What an edit did, in words: `set to “visited”`, `+1`, `added “urgent”`. */
export function describeChange(op: Operation): string {
  const c = op.change
  switch (c.type) {
    case 'set':
      return `set to ${quote(c.value)}`
    case 'increment':
      return c.by >= 0 ? `+${c.by}` : `${c.by}`
    case 'add':
      return `added ${quote(c.element)}`
    case 'remove':
      return `removed ${quote(c.element)}`
  }
}

export const quote = (v: FieldValue) => (typeof v === 'string' ? `“${v}”` : JSON.stringify(v))
