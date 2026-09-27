import { SCENARIOS } from '../scenarios'
import type { SimulationControls } from '../useSimulation'

/** Guided, step-by-step stories. Each one starts from its own seed, so it plays out the same way every time. */
export function ScenarioPanel({ controls }: { controls: SimulationControls }) {
  const { scenario: active, startScenario, nextStep, exitScenario } = controls

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

  const { scenario, step } = active
  const last = step === scenario.steps.length - 1

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
        <button type="button" className="btn" onClick={() => startScenario(scenario)}>
          Restart
        </button>
        <button type="button" className="btn" onClick={exitScenario}>
          Exit scenario
        </button>
      </div>
      <p className="group__note">Auto-sync is off: phones sync only when a step says so.</p>
    </section>
  )
}
