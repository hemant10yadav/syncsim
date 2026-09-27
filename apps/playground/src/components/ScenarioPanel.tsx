import { useEffect } from 'react'
import { SCENARIOS } from '../scenarios'
import type { SimulationControls } from '../useSimulation'

/** Real ms a step stays on screen while a scenario plays itself: long enough to read the caption. */
const AUTOPLAY_STEP_MS = 5_000

/** Guided, step-by-step stories. Each one starts from its own seed, so it plays out the same way every time. */
export function ScenarioPanel({ controls }: { controls: SimulationControls }) {
  const { scenario: active, startScenario, nextStep, exitScenario, autoplay, setAutoplay } = controls
  const step = active?.step ?? 0
  const last = !active || step === active.scenario.steps.length - 1

  useEffect(() => {
    if (!autoplay || last) return
    const timer = window.setTimeout(nextStep, AUTOPLAY_STEP_MS)
    return () => window.clearTimeout(timer)
    // nextStep changes with every step, which restarts the timer for the next one.
  }, [autoplay, last, nextStep])

  if (!active) {
    return (
      <section className="scenarios" aria-label="Guided scenarios">
        <h2 className="scenarios__title">Guided scenarios</h2>
        <ul className="scenarios__list">
          {SCENARIOS.map((s) => (
            <li key={s.id}>
              <button type="button" className="scenario-card" onClick={() => startScenario(s)}>
                <span className="scenario-card__title">{s.title}</span>
                <span className="scenario-card__summary">{s.summary}</span>
                <span className="scenario-card__cta">Play ▸</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  const { scenario } = active

  return (
    <section className="scenario-player" aria-label={`Scenario: ${scenario.title}`}>
      <div className="scenario-player__head">
        <h2 className="scenario-player__title">{scenario.title}</h2>
        <span className="mono muted">
          step {step + 1} of {scenario.steps.length}
        </span>
      </div>
      <ol className="scenario-player__progress" aria-hidden>
        {scenario.steps.map((_, i) => (
          <li key={i} className={i <= step ? 'is-done' : ''} />
        ))}
      </ol>
      <p className="scenario-player__caption" aria-live="polite">
        {scenario.steps[step]!.caption}
      </p>
      <div className="row">
        <button type="button" className="btn btn--primary" onClick={nextStep} disabled={last}>
          {last ? 'Done' : 'Next step'}
        </button>
        {!last && (
          <button type="button" className="btn" aria-pressed={autoplay} onClick={() => setAutoplay(!autoplay)}>
            {autoplay ? 'Pause autoplay' : 'Autoplay'}
          </button>
        )}
        <button type="button" className="btn" onClick={() => startScenario(scenario)}>
          Restart
        </button>
        <button type="button" className="btn" onClick={exitScenario}>
          Exit scenario
        </button>
      </div>
      <p className="group__note">
        {autoplay && !last ? 'Playing by itself: the next step starts in a few seconds. ' : ''}
        Auto-sync is off: phones sync only when a step says so.
      </p>
    </section>
  )
}
