import type { NodeId, Replica } from '@syncsim/engine'
import { describeChange } from '../format'

/** Rows shown before the rest are summarised, so a long session stays readable. */
const MAX_ROWS = 25

interface EditLogProps {
  replica: Replica
  labelFor: (node: NodeId) => string
}

/**
 * Every edit this device holds, newest first, and its version vector: for each
 * device, how many of its edits this one holds without a gap. An edit past a gap
 * is applied but the vector does not count it yet, so the next pull still asks
 * for the missing one.
 */
export function EditLog({ replica, labelFor }: EditLogProps) {
  const ops = replica.missingFor({}).reverse()
  const vector = replica.versionVector()
  const nodes = [...new Set([...Object.keys(vector), ...ops.map((op) => op.node)])].sort()

  return (
    <details className="log">
      <summary className="log__summary">
        Edit log · {ops.length} {ops.length === 1 ? 'edit' : 'edits'}
      </summary>
      <div className="log__body">
        <p className="log__vector" aria-label="Version vector">
          <span className="log__vector-label">Has</span>
          {nodes.map((node) => (
            <span key={node} className="log__chip">
              {labelFor(node)} {vector[node] ? `#1–${vector[node]}` : 'none'}
            </span>
          ))}
        </p>
        <ol className="log__list">
          {ops.slice(0, MAX_ROWS).map((op) => {
            const upTo = vector[op.node] ?? 0
            return (
              <li key={op.id} className={`log__row${op.node === replica.node ? ' is-own' : ''}`}>
                <span className="log__id">{op.id}</span>
                <span className="log__what">
                  {op.field} {describeChange(op)}
                </span>
                <span className="log__from">
                  {op.node === replica.node ? 'made here' : `from ${labelFor(op.node)}`}
                  {op.seq > upTo && <span className="log__gap"> · waiting for #{upTo + 1}</span>}
                </span>
              </li>
            )
          })}
        </ol>
        {ops.length > MAX_ROWS && <p className="log__more">and {ops.length - MAX_ROWS} older edits</p>}
      </div>
    </details>
  )
}
