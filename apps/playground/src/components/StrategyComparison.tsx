import {
  explainField,
  isSet,
  REGISTER_STRATEGIES,
  standingWrites,
  type FieldName,
  type NodeId,
  type RegisterStrategy,
  type Simulation,
} from '@syncsim/engine'
import { useState } from 'react'
import { quote } from '../format'
import { STRATEGY_INFO } from '../labels'
import { CASE, DEVICES } from '../world'
import { Segmented } from './Segmented'

const FIELDS: readonly { field: FieldName; label: string }[] = [
  { field: 'name', label: 'Patient' },
  { field: 'status', label: 'Status' },
  { field: 'visits', label: 'Visits' },
  { field: 'tags', label: 'Tags' },
]

interface Cell {
  readonly text: string
  readonly conflict: boolean
}

interface StrategyComparisonProps {
  sim: Simulation
  strategy: RegisterStrategy
  onChoose: (strategy: RegisterStrategy) => void
}

/**
 * The same history read under every merge strategy at once, so the difference
 * between them is visible without switching. Only plain-value fields depend on
 * the strategy; counters and sets merge the same way under all three.
 */
export function StrategyComparison({ sim, strategy, onChoose }: StrategyComparisonProps) {
  const [phone, setPhone] = useState<NodeId>(DEVICES[0]!.id)
  const replica = sim.replica(phone)
  const fields = FIELDS.filter(({ field }) => replica.kindOf(field) === 'register')

  const rows = REGISTER_STRATEGIES.map((s) => {
    let lost = 0
    const cells = fields.map(({ field }): Cell => {
      // The ops a phone holds do not depend on the strategy, only how they are read.
      const ops = replica.explain(CASE, field).map((e) => e.op)
      lost += explainField('register', s, ops).filter((e) => e.verdict.kind === 'lost').length
      const standing = standingWrites(s, ops.filter(isSet))
      if (standing.length === 0) return { text: '—', conflict: false }
      if (standing.length > 1) {
        return { text: standing.map((op) => quote(op.change.value)).join(' or '), conflict: true }
      }
      return { text: quote(standing[0]!.change.value), conflict: false }
    })
    return { strategy: s, cells, lost }
  })
  const differs = (column: number) => new Set(rows.map((r) => r.cells[column]!.text)).size > 1

  return (
    <section className="compare" aria-label="The same history under every merge strategy">
      <div className="compare__head">
        <div>
          <h2 className="compare__title">Same edits, three rules</h2>
          <p className="group__note">
            What each merge strategy shows for the edits this phone holds. Click a row to use that strategy.
          </p>
        </div>
        <Segmented
          label="Seen by"
          options={DEVICES.map((d) => ({ value: d.id, label: d.label }))}
          value={phone}
          onChange={setPhone}
        />
      </div>
      {fields.length === 0 ? (
        <p className="group__note">Every field here is a counter or a set, so all three strategies agree.</p>
      ) : (
        <div className="compare__scroll">
          <table className="compare__table">
            <thead>
              <tr>
                <th scope="col">Strategy</th>
                {fields.map((f, i) => (
                  <th key={f.field} scope="col" className={differs(i) ? 'is-different' : ''}>
                    {f.label}
                    {differs(i) && <span className="compare__diff"> differs</span>}
                  </th>
                ))}
                <th scope="col">Edits lost</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.strategy}
                  className={row.strategy === strategy ? 'is-current' : ''}
                  aria-current={row.strategy === strategy ? 'true' : undefined}
                >
                  <th scope="row">
                    <button
                      type="button"
                      className="compare__choose"
                      aria-label={`Use ${STRATEGY_INFO[row.strategy].label}`}
                      onClick={() => onChoose(row.strategy)}
                    >
                      {STRATEGY_INFO[row.strategy].label}
                    </button>
                  </th>
                  {row.cells.map((cell, i) => (
                    <td key={fields[i]!.field} className={cell.conflict ? 'is-conflict' : ''}>
                      {cell.conflict && <span aria-hidden>⚠ </span>}
                      {cell.text}
                    </td>
                  ))}
                  <td className={row.lost > 0 ? 'is-lost' : 'is-kept'}>
                    {row.lost > 0 ? `${row.lost} silently` : 'none'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
