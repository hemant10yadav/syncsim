import type { FieldValue } from '@syncsim/engine'
import { useState } from 'react'
import { problemSteps } from '../examples'
import { PLAYGROUND_URL } from '../links'
import { Section } from './Section'

const STEPS = problemSteps()

export function ProblemSection() {
  const [step, setStep] = useState(0)
  const current = STEPS[step]!
  const last = step === STEPS.length - 1
  const lostBy = last ? current.lost?.by : undefined

  return (
    <Section id="problem" number={1} title="The problem" takeaway="The obvious merge quietly deletes work">
      <p>
        Health workers often visit patients where there is no signal. Two of them update the same case on their
        phones, both offline. Later both phones reconnect. The usual fix is to keep whichever edit is newest and drop
        the other. Nobody sees an error. One person’s work is just gone.
      </p>

      <figure className="ap-figure">
        <div className="problem">
          <MiniPhone name="Phone A" value={current.a} online={current.online} lost={lostBy === 'A'} />
          <div className={`problem__link ${current.online ? 'is-up' : 'is-down'}`} aria-hidden>
            <span>{current.online ? 'in sync' : 'no signal'}</span>
          </div>
          <MiniPhone name="Phone B" value={current.b} online={current.online} lost={lostBy === 'B'} />
        </div>
        <p className="problem__caption" aria-live="polite">
          <span className="mono muted">
            {step + 1}/{STEPS.length}
          </span>{' '}
          {current.caption}
          {last && current.lost && (
            <>
              {' '}
              <strong className="ap-lost">
                Phone {current.lost.by}’s “{String(current.lost.value)}” was silently lost.
              </strong>
            </>
          )}
        </p>
        <div className="ap-row">
          <button type="button" className="ap-btn" onClick={() => setStep(step - 1)} disabled={step === 0}>
            Back
          </button>
          <button type="button" className="ap-btn ap-btn--primary" onClick={() => setStep(last ? 0 : step + 1)}>
            {last ? 'Start again' : 'Next'}
          </button>
        </div>
        <figcaption className="ap-figcaption">
          Computed by the engine using “latest edit wins”. The same story plays in the{' '}
          <a href={PLAYGROUND_URL}>playground</a> as a guided scenario.
        </figcaption>
      </figure>

      <p>
        Getting every phone to agree is the easy half. The hard half is agreeing <em>without</em> losing anyone’s edit,
        when messages arrive late, twice, out of order or not at all, and when the phones’ clocks are wrong. Engineers
        call the first half <strong>convergence</strong>: once every phone has heard every edit, they all show the same
        thing.
      </p>
    </Section>
  )
}

interface MiniPhoneProps {
  name: string
  value: FieldValue | undefined
  online: boolean
  lost: boolean
}

function MiniPhone({ name, value, online, lost }: MiniPhoneProps) {
  return (
    <div className={`mini-phone${online ? '' : ' is-offline'}`}>
      <div className="mini-phone__bar">
        <span>{name}</span>
        <span className={online ? 'mini-phone__on' : 'mini-phone__off'}>{online ? 'online' : 'offline'}</span>
      </div>
      <div className="mini-phone__label">Status</div>
      <div className="mini-phone__value">{String(value ?? '—')}</div>
      <div className="mini-phone__note ap-lost">{lost ? 'its own edit was overwritten' : ' '}</div>
    </div>
  )
}
