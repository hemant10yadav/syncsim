import type { ExplainedOp, FieldName, FieldValue, NodeId, RegisterStrategy, Replica } from '@syncsim/engine'
import { CASE } from '../world'

interface WhyPanelProps {
  replica: Replica
  field: FieldName
  labelFor: (node: NodeId) => string
}

/** Every edit to one field and what became of it, so a silently lost edit is visible. */
export function WhyPanel({ replica, field, labelFor }: WhyPanelProps) {
  const history = replica.explain(CASE, field)
  const strategy = replica.registerStrategy
  const byId = new Map(history.map((h) => [h.op.id, h.op]))
  const who = (id: string) => {
    const op = byId.get(id)
    return op ? labelFor(op.node) : id
  }

  return (
    <div className="why" role="region" aria-label={`Why ${field} shows this value`}>
      <p className="why__summary">{summary(replica.kindOf(field), strategy)}</p>
      {history.length === 0 ? (
        <p className="why__empty">No edits yet on this phone.</p>
      ) : (
        <ol className="why__list">
          {history.map((entry) => (
            <li key={entry.op.id} className={`why__row why__row--${entry.verdict.kind}`}>
              <div className="why__head">
                <span className="why__what">{describeChange(entry)}</span>
                <span className={`why__badge why__badge--${entry.verdict.kind}`}>{badge(entry)}</span>
              </div>
              <div className="why__meta">
                {labelFor(entry.op.node)} · edit #{entry.op.seq} · {labelFor(entry.op.node)}’s clock{' '}
                {formatClock(entry.op.deviceTime)}
              </div>
              {reason(entry, strategy, who) && <div className="why__reason">{reason(entry, strategy, who)}</div>}
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

function summary(kind: ReturnType<Replica['kindOf']>, strategy: RegisterStrategy): string {
  if (kind === 'counter') return 'A counter: every increment counts, whatever order they arrive in.'
  if (kind === 'set') return 'A set: a remove only cancels the adds it had seen.'
  switch (strategy) {
    case 'lww-wall':
      return 'Device clock wins: the edit whose phone clock reads latest is shown.'
    case 'lww-hlc':
      return 'Logical clock wins: the latest edit is shown, even over one it never saw.'
    case 'multi-value':
      return 'Keep conflicts: every edit nobody has replaced stays until someone picks one.'
  }
}

function describeChange({ op }: ExplainedOp): string {
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

function badge({ verdict }: ExplainedOp): string {
  switch (verdict.kind) {
    case 'shown':
      return 'shown'
    case 'competing':
      return 'in conflict'
    case 'replaced':
      return 'replaced'
    case 'lost':
      return 'silently lost'
    case 'counted':
      return 'counted'
    case 'present':
      return 'present'
    case 'removed':
      return 'removed'
    case 'remove':
      return 'remove'
  }
}

function reason({ verdict }: ExplainedOp, strategy: RegisterStrategy, who: (id: string) => string): string | null {
  switch (verdict.kind) {
    case 'replaced':
      return `${list(verdict.by.map(who))} saw this edit and changed it.`
    case 'lost':
      return strategy === 'lww-wall'
        ? `${who(verdict.to)}’s edit won because its clock read later. ${who(verdict.to)} never saw this one, and nobody was told.`
        : `${who(verdict.to)}’s edit came later and won. ${who(verdict.to)} never saw this one, and nobody was told.`
    case 'competing':
      return 'Made without seeing the other version. Pick one on the phone to resolve it.'
    case 'removed':
      return verdict.by.length > 0 ? `Removed by ${list(verdict.by.map(who))}.` : null
    case 'remove':
      return verdict.cancelled === 0
        ? 'It had not seen any add of this tag, so it cancels nothing.'
        : `Cancels the ${verdict.cancelled === 1 ? 'add' : `${verdict.cancelled} adds`} it had seen. Adds it had not seen still count.`
    default:
      return null
  }
}

function formatClock(ms: number): string {
  const sign = ms < 0 ? '−' : ''
  const total = Math.abs(ms) / 1000
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = (total % 60).toFixed(1).padStart(4, '0')
  return `${sign}${h}:${String(m).padStart(2, '0')}:${s}`
}

const quote = (v: FieldValue | string) => (typeof v === 'string' ? `“${v}”` : JSON.stringify(v))
const list = (names: string[]) => [...new Set(names)].join(' and ')
