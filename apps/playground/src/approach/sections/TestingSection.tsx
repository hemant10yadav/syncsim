import { JOURNAL_DOC_URL } from '../links'
import { Section } from './Section'

/** Every figure here is taken from the tests or docs/JOURNAL.md. */
const STATS = [
  { value: '500 + 200', label: 'random histories per test run, across the two convergence property tests' },
  { value: '10–80', label: 'steps in each history: edits, syncs, partitions, phones going offline' },
  { value: '±1 h', label: 'clock skew on each phone' },
  { value: '≤ 30%', label: 'of messages lost, and up to 30% duplicated, in the network test' },
]

const PLANTED = [
  { bug: 'The latest arrival wins, instead of the merge rule', caught: 'Failed after 24 runs, with a two-edit counterexample' },
  { bug: 'Every sync reply from one phone is dropped', caught: 'Failed after 2 runs' },
  { bug: 'The counter ignores decrements', caught: '3 tests failed' },
  { bug: 'A remove cancels adds it never saw', caught: '4 tests failed' },
  { bug: 'Keep conflicts ignores supersedes', caught: '4 tests failed' },
]

export function TestingSection() {
  return (
    <Section id="testing" number={6} title="How it’s tested" takeaway="The claims above are checked, not just stated">
      <p>
        A sync bug usually needs a particular order of events to show up, so hand-written tests miss most of them. The
        core tests are <strong>property tests</strong>: the test library generates random histories on a hostile
        network, then checks rules that must always hold.
      </p>

      <ul className="stats" aria-label="Property test settings">
        {STATS.map((s) => (
          <li key={s.value} className="stats__item">
            <span className="stats__value">{s.value}</span>
            <span className="stats__label">{s.label}</span>
          </li>
        ))}
      </ul>

      <p>
        After the network heals, every phone must hold the same data and the same conflicts, and every counter must
        equal the sum of every increment ever made. A separate check for each merge rule shuffles the edits and
        confirms the result never changes.
      </p>

      <h3 className="ap-h3">Tests that can fail</h3>
      <p>
        A test that has never failed proves little. For each property test I planted a bug on purpose and checked that
        the test caught it, then removed the bug.
      </p>
      <div className="ap-scroll">
        <table className="planted">
          <thead>
            <tr>
              <th scope="col">Planted bug</th>
              <th scope="col">Result</th>
            </tr>
          </thead>
          <tbody>
            {PLANTED.map((p) => (
              <tr key={p.bug}>
                <td>{p.bug}</td>
                <td className="planted__caught">✓ {p.caught}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p>
        The property tests also found a real bug I had not planted: every phone found the same conflicts, but listed
        them in the order it happened to receive the records, so the lists differed from phone to phone. Output is now
        sorted.
      </p>

      <h3 className="ap-h3">Beyond the engine</h3>
      <ul className="ap-list">
        <li>
          <strong>Scenario tests</strong> play each of the five guided scenarios without the UI and check that every
          caption is true after every step.
        </li>
        <li>
          <strong>This page’s examples</strong> are built with the engine and tested the same way, so the text cannot
          drift from what the code does.
        </li>
        <li>
          <strong>Browser checks.</strong> Before each merge I ran a Playwright script in Chrome that plays every
          scenario, syncs two real tabs, and checks console errors and layout at phone width. It is not in CI yet.
        </li>
      </ul>
      <p className="muted">
        Every bug above, and every other problem I hit while building this, is written up in the{' '}
        <a href={JOURNAL_DOC_URL}>build journal</a>.
      </p>
    </Section>
  )
}
