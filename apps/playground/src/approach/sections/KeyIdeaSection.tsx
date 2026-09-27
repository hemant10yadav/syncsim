import { useMemo, useState } from 'react'
import { deliverShuffled, keyIdeaWrites, type KeyIdeaWrite } from '../examples'
import { Section } from './Section'

export function KeyIdeaSection() {
  const [withResolution, setWithResolution] = useState(false)
  const [seed, setSeed] = useState(1)
  /** Distinct arrival orders seen for the current set of writes. */
  const [seen, setSeen] = useState<ReadonlySet<string>>(() => new Set([deliverShuffled(keyIdeaWrites(false), 1).order.join()]))
  const writes = useMemo(() => keyIdeaWrites(withResolution), [withResolution])
  const delivery = deliverShuffled(writes, seed)
  const byId = new Map(writes.map((w) => [w.op.id, w]))
  const replacedBy = new Map<string, string[]>()
  for (const w of writes) for (const id of w.op.change.supersedes) replacedBy.set(id, [...(replacedBy.get(id) ?? []), w.op.id])

  const tiers = [writes.slice(0, 1), writes.slice(1, 3), writes.slice(3)].filter((t) => t.length > 0)

  return (
    <Section
      id="key-idea"
      number={3}
      title="The key idea: every write says what it replaced"
      takeaway="Record what each person saw, and order stops mattering"
    >
      <p>
        When someone changes a field, their phone is showing them some value. That is the value they are replacing. So
        every write in syncsim carries a list called <code>supersedes</code>: the ids of the values that were on screen
        when it was made. A value is <strong>standing</strong> if no write lists it. If one value is standing, that is
        the answer. If two are, they were made without seeing each other, and that is a real conflict.
      </p>

      <figure className="ap-figure ap-figure--wide key">
        <div className="key__graph" role="img" aria-label={graphLabel(writes, replacedBy)}>
          {tiers.map((tier, i) => (
            <div key={i} className="key__tier">
              {tier.map((w) => (
                <WriteCard key={w.op.id} write={w} replacedBy={replacedBy.get(w.op.id)} byId={byId} />
              ))}
            </div>
          ))}
        </div>

        <div className="key__delivery">
          <div className="key__delivery-head">
            <h3 className="key__h3">A fresh phone receives these writes in this order</h3>
            <label className="ap-check">
              <input
                type="checkbox"
                checked={withResolution}
                onChange={(e) => {
                  const next = e.target.checked
                  setWithResolution(next)
                  setSeen(new Set([deliverShuffled(keyIdeaWrites(next), seed).order.join()]))
                }}
              />
              Add the supervisor’s resolution
            </label>
          </div>
          <ol className="key__order" aria-label="Arrival order">
            {delivery.order.map((id) => (
              <li key={id} className="key__chip">
                <span className="mono">{id}</span> “{String(byId.get(id)!.op.change.value)}”
              </li>
            ))}
          </ol>
          <p className="key__result" aria-live="polite">
            Standing: <strong>{delivery.standing.map((v) => `“${String(v)}”`).join(' and ')}</strong>
            {delivery.standing.length > 1 ? ', a conflict' : ''}.{' '}
            <span className={seen.size === 1 ? 'key__same is-waiting' : 'key__same'}>
              {seen.size === 1
                ? 'Shuffle to try another order.'
                : `✓ Same result for all ${seen.size} different orders tried so far`}
            </span>
          </p>
          <button
            type="button"
            className="ap-btn ap-btn--primary"
            onClick={() => {
              setSeed(seed + 1)
              setSeen(new Set([...seen, deliverShuffled(writes, seed + 1).order.join()]))
            }}
          >
            Shuffle arrival order
          </button>
        </div>
        <figcaption className="ap-figcaption">
          Each shuffle builds a new phone with the real engine and delivers the same writes in a new order. The test
          suite runs 50 shuffles of both versions of this example.
        </figcaption>
      </figure>

      <p>
        Because the answer is worked out from the whole <em>set</em> of writes a phone holds, and never from the order
        they came in, two phones holding the same writes always show the same thing. That is what makes convergence
        hold on a network that reorders and duplicates messages.
      </p>

      <aside className="ap-story">
        <h3 className="ap-story__title">The first design failed on paper</h3>
        <p>
          My first plan used <strong>version vectors</strong>: a short summary each phone keeps of how many edits it has
          from every other phone (“A’s edits 1 to 5, B’s 1 to 3”). A write would count as replaced if a later writer’s
          vector covered it. Two problems showed up before I wrote any code. A version vector only counts edits
          received without a gap, so a value the writer <em>had</em> seen, but received out of order, would not count as
          replaced, and the phone would report a conflict that did not exist. And keeping only the current winners,
          throwing replaced writes away as they arrive, makes the result depend on arrival order. Recording exactly
          what each writer saw fixed both.
        </p>
      </aside>
    </Section>
  )
}

interface WriteCardProps {
  write: KeyIdeaWrite
  replacedBy: string[] | undefined
  byId: Map<string, KeyIdeaWrite>
}

function WriteCard({ write, replacedBy, byId }: WriteCardProps) {
  const { op, label } = write
  const standing = !replacedBy
  return (
    <div className={`key__card${standing ? ' is-standing' : ' is-replaced'}`}>
      <div className="key__card-head">
        <span className="mono">{op.id}</span>
        <span className={standing ? 'key__badge is-standing' : 'key__badge'}>{standing ? 'standing' : 'replaced'}</span>
      </div>
      <div className="key__value">“{String(op.change.value)}”</div>
      <div className="key__label">{label}</div>
      <div className="key__supersedes">
        <span className="muted">supersedes</span>{' '}
        {op.change.supersedes.length === 0 ? (
          <span className="muted">nothing</span>
        ) : (
          op.change.supersedes.map((id) => (
            <span key={id} className="key__ref">
              ↑ {id} “{String(byId.get(id)?.op.change.value)}”
            </span>
          ))
        )}
      </div>
    </div>
  )
}

function graphLabel(writes: readonly KeyIdeaWrite[], replacedBy: Map<string, string[]>) {
  const parts = writes.map((w) => {
    const replaced = w.op.change.supersedes.length ? `replaces ${w.op.change.supersedes.join(' and ')}` : 'replaces nothing'
    const state = replacedBy.has(w.op.id) ? `replaced by ${replacedBy.get(w.op.id)!.join(' and ')}` : 'standing'
    return `${w.op.id}, ${String(w.op.change.value)}, ${replaced}, ${state}`
  })
  return `Writes to the status field: ${parts.join('; ')}.`
}
