import type { Timestamp } from '@syncsim/engine'
import { clockExample, type ClockEdit } from '../examples'
import { Section } from './Section'

const EX = clockExample()

/** ms after midnight as HH:MM. */
const hhmm = (ms: number) => {
  const minutes = Math.floor(ms / 60_000)
  return `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}
const hlc = (ts: Timestamp) => `${hhmm(ts.wall)} · ${ts.counter}`

export function ClocksSection() {
  const wallWinner = EX.winners['lww-wall']
  const hlcWinner = EX.winners['lww-hlc']

  return (
    <Section id="clocks" number={2} title="Why clocks lie" takeaway="A phone with a fast clock wins every argument">
      <p>
        “Newest edit wins” needs to know which edit is newest, and phones only have their own clocks. Phone clocks are
        often wrong. If phone A’s clock runs an hour fast, every edit A makes looks an hour newer than it is. It beats
        edits made after it, even by people who saw A’s change and deliberately fixed it.
      </p>

      <figure className="ap-figure">
        <div className="clocks" role="img" aria-label={clocksLabel()}>
          <div className="clocks__story">
            <Edit edit={EX.first} note={`clock ${EX.skewMs / 3_600_000} h fast`} />
            <div className="clocks__arrow" aria-hidden>
              B sees it →
            </div>
            <Edit edit={EX.second} note="clock correct" />
          </div>
          <div className="clocks__rows">
            <Row
              title="By each phone’s clock"
              a={hhmm(EX.first.deviceTime)}
              b={hhmm(EX.second.deviceTime)}
              winner={wallWinner}
              good={wallWinner === EX.second.value}
            />
            <Row
              title="By logical clock"
              a={hlc(EX.first.ts)}
              b={hlc(EX.second.ts)}
              winner={hlcWinner}
              good={hlcWinner === EX.second.value}
            />
          </div>
        </div>
        <figcaption className="ap-figcaption">
          Times are an example. Who wins is computed by the engine for exactly this history.
        </figcaption>
      </figure>

      <p>
        The fix is a <strong>hybrid logical clock</strong> (HLC). It is a timestamp that follows real time but obeys two
        rules. It never goes backwards, even if the phone’s clock does. And when a phone receives an edit, its clock
        jumps past that edit’s timestamp. So if B has seen A’s edit, anything B writes next is stamped later, whatever
        the clocks say. Ties are broken by a counter, then by device name, so every phone sorts edits the same way.
      </p>
      <p>
        What an HLC cannot do is decide fairly between two edits made at the same moment by phones that had not seen
        each other. There is no right answer to “who was later” then. That case needs a different idea.
      </p>
    </Section>
  )
}

function Edit({ edit, note }: { edit: ClockEdit; note: string }) {
  return (
    <div className="clocks__edit">
      <span className="clocks__device">Phone {edit.device}</span>
      <span className="clocks__value">“{String(edit.value)}”</span>
      <span className="muted">{note}</span>
    </div>
  )
}

interface RowProps {
  title: string
  a: string
  b: string
  winner: unknown
  good: boolean
}

function Row({ title, a, b, winner, good }: RowProps) {
  return (
    <div className="clocks__row">
      <div className="clocks__row-title">{title}</div>
      <div className="clocks__stamps">
        <span className="mono">A {a}</span>
        <span className="mono">B {b}</span>
      </div>
      <div className={good ? 'clocks__verdict is-good' : 'clocks__verdict is-bad'}>
        {good ? '✓' : '✗'} “{String(winner)}” wins{good ? '' : ', the older edit'}
      </div>
    </div>
  )
}

function clocksLabel() {
  return (
    `Phone A, with a clock ${EX.skewMs / 3_600_000} hour fast, sets status to ${String(EX.first.value)}. ` +
    `Phone B sees it and corrects it to ${String(EX.second.value)}. ` +
    `By each phone's clock, A's older edit reads ${hhmm(EX.first.deviceTime)} against B's ${hhmm(EX.second.deviceTime)}, so ${String(EX.winners['lww-wall'])} wins. ` +
    `By logical clock, B's stamp moves past A's, so ${String(EX.winners['lww-hlc'])} wins.`
  )
}
