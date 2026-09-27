import { REGISTER_STRATEGIES, type FieldValue } from '@syncsim/engine'
import { STRATEGY_INFO } from '../../labels'
import { strategyHistories } from '../examples'
import { Section } from './Section'

const HISTORIES = strategyHistories()

const HOW: Record<(typeof REGISTER_STRATEGIES)[number], string> = {
  'lww-wall': 'The edit whose phone clock reads latest.',
  'lww-hlc': 'The edit with the latest logical clock.',
  'multi-value': 'Every edit nobody replaced, until someone picks one.',
}

const list = (values: readonly FieldValue[]) => values.map((v) => `“${String(v)}”`).join(' and ')

export function StrategiesSection() {
  return (
    <Section
      id="strategies"
      number={4}
      title="Three merge strategies, same edits"
      takeaway="Every rule trades something away"
    >
      <p>
        syncsim implements three rules for fields that hold one value, and can switch between them at any time. It
        never throws edits away, it only reads them differently, so all three can be compared on exactly the same
        history.
      </p>

      <div className="strats">
        {HISTORIES.map((h) => (
          <figure key={h.title} className="strats__card">
            <figcaption>
              <h3 className="strats__title">{h.title}</h3>
              <p className="strats__story">{h.story}</p>
            </figcaption>
            <table className="strats__table">
              <thead>
                <tr>
                  <th scope="col">Strategy</th>
                  <th scope="col">Shows</th>
                  <th scope="col">Loses</th>
                </tr>
              </thead>
              <tbody>
                {REGISTER_STRATEGIES.map((s) => {
                  const o = h.outcomes[s]
                  return (
                    <tr key={s}>
                      <th scope="row">{STRATEGY_INFO[s].label}</th>
                      <td className={o.shown.length > 1 ? 'is-conflict' : ''}>
                        {o.shown.length > 1 ? `⚠ ${list(o.shown)}` : list(o.shown)}
                      </td>
                      <td className={o.lost.length > 0 ? 'is-lost' : 'is-kept'}>
                        {o.lost.length > 0 ? `${list(o.lost)}, silently` : 'nothing'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </figure>
        ))}
      </div>

      <dl className="strats__how">
        {REGISTER_STRATEGIES.map((s) => (
          <div key={s}>
            <dt>{STRATEGY_INFO[s].label}</dt>
            <dd>{HOW[s]}</dd>
          </div>
        ))}
      </dl>

      <p>
        <strong>Device clock wins</strong> is what many apps do, and it fails both histories. <strong>Logical clock
        wins</strong> handles the correction but still drops one of two simultaneous edits without telling anyone.{' '}
        <strong>Keep conflicts</strong> never loses an edit, at a price: a person has to choose, and the app has to ask
        them.
      </p>
    </Section>
  )
}
