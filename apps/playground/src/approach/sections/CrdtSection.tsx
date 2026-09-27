import { counterExample, setExample } from '../examples'
import { Section } from './Section'

const COUNTER = counterExample()
const SET = setExample()

const tags = (values: readonly string[]) => (values.length === 0 ? 'no tags' : values.map((v) => `“${v}”`).join(', '))

export function CrdtSection() {
  return (
    <Section
      id="crdts"
      number={5}
      title="Counters and sets that merge themselves"
      takeaway="Some fields should never conflict at all"
    >
      <p>
        For some fields, “which edit wins?” is the wrong question. Two visits are two visits. A <strong>CRDT</strong>{' '}
        (conflict-free replicated data type) is a data type designed so that edits from different devices always
        combine, in any order, without anyone choosing. syncsim uses two.
      </p>

      <div className="crdt">
        <figure className="crdt__card">
          <h3 className="crdt__title">Counter (PN-counter)</h3>
          <p>
            The case has {COUNTER.start} visit. Two health workers each record a visit while offline, then sync.
          </p>
          <div className="crdt__compare">
            <div className="crdt__cell is-bad">
              <span className="crdt__label">Plain value</span>
              <span className="crdt__value">{COUNTER.plain}</span>
              <span className="crdt__note">each phone wrote “{COUNTER.start + 1}”; one replaced the other</span>
            </div>
            <div className="crdt__cell is-good">
              <span className="crdt__label">Counter</span>
              <span className="crdt__value">{COUNTER.counter}</span>
              <span className="crdt__note">each visit is its own +1, and every +1 counts</span>
            </div>
          </div>
          <figcaption className="ap-figcaption">
            A plain value stores the result. A counter stores the increments and adds them up, so none can overwrite
            another. Decrements are increments of −1.
          </figcaption>
        </figure>

        <figure className="crdt__card">
          <h3 className="crdt__title">Tag set (OR-set)</h3>
          <p>
            The case is tagged “urgent” on both phones. Offline, B removes the tag while A tags it urgent again.
          </p>
          <div className="crdt__compare">
            <div className="crdt__cell is-bad">
              <span className="crdt__label">Plain list</span>
              <span className="crdt__value crdt__value--text">{tags(SET.plain)}</span>
              <span className="crdt__note">B’s newer list replaced A’s</span>
            </div>
            <div className="crdt__cell is-good">
              <span className="crdt__label">OR-set</span>
              <span className="crdt__value crdt__value--text">{tags(SET.set)}</span>
              <span className="crdt__note">B’s remove only cancelled the add it had seen</span>
            </div>
          </div>
          <figcaption className="ap-figcaption">
            An observed-remove set tags every add with its own id. A remove cancels only the adds its phone had seen,
            so an add made at the same time survives. It is the same idea as <code>supersedes</code>: record what you
            saw.
          </figcaption>
        </figure>
      </div>
    </Section>
  )
}
