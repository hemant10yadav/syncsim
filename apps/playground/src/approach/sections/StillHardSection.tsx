import { APPROACH_DOC_URL } from '../links'
import { Section } from './Section'

const LIMITS = [
  {
    title: 'The log grows forever',
    body: 'Every edit is kept, including replaced ones. A real system would fold old edits into a snapshot once every device is known to hold them.',
  },
  {
    title: 'Every phone talks to every phone',
    body: 'Fine for three phones, not for thousands. Real offline-first apps usually sync through a server that holds the canonical log.',
  },
  {
    title: 'A clock years ahead poisons everyone',
    body: 'A phone with a wildly wrong clock pushes every other phone’s logical clock forward for good. Production clocks reject or clamp timestamps beyond a maximum drift.',
  },
  {
    title: 'Nothing is saved',
    body: 'State lives in memory. Surviving a restart needs durable storage, and care to save an edit before telling anyone it exists.',
  },
]

export function StillHardSection() {
  return (
    <Section id="still-hard" number={7} title="What’s still hard" takeaway="Where this would break in production">
      <p>The engine is correct for what it models. A real deployment would hit these limits first.</p>
      <ul className="limits">
        {LIMITS.map((l) => (
          <li key={l.title} className="limits__item">
            <h3 className="limits__title">{l.title}</h3>
            <p>{l.body}</p>
          </li>
        ))}
      </ul>
      <p>
        The <a href={APPROACH_DOC_URL}>full write-up</a> lists ten, with what I would build next.
      </p>
    </Section>
  )
}
