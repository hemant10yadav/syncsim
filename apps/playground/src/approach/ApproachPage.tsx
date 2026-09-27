import { useTheme } from '../useTheme'
import { APPROACH_DOC_URL, JOURNAL_DOC_URL, PLAYGROUND_URL, PORTFOLIO_URL, REPO_URL } from './links'
import { ClocksSection } from './sections/ClocksSection'
import { CrdtSection } from './sections/CrdtSection'
import { KeyIdeaSection } from './sections/KeyIdeaSection'
import { ProblemSection } from './sections/ProblemSection'
import { StillHardSection } from './sections/StillHardSection'
import { StrategiesSection } from './sections/StrategiesSection'
import { TestingSection } from './sections/TestingSection'

const CONTENTS = [
  { id: 'problem', label: 'The problem' },
  { id: 'clocks', label: 'Why clocks lie' },
  { id: 'key-idea', label: 'The key idea' },
  { id: 'strategies', label: 'Three strategies' },
  { id: 'crdts', label: 'Counters and sets' },
  { id: 'testing', label: 'How it’s tested' },
  { id: 'still-hard', label: 'What’s still hard' },
] as const

export function ApproachPage() {
  const [theme, setTheme] = useTheme()

  return (
    <div className="ap">
      <header className="ap-bar">
        <a className="ap-bar__brand" href={PLAYGROUND_URL}>
          syncsim
        </a>
        <nav className="ap-bar__links" aria-label="Site">
          <a href={PLAYGROUND_URL}>Playground</a>
          <a href={REPO_URL}>GitHub</a>
          <button
            type="button"
            className="ap-theme"
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
          >
            {theme === 'dark' ? '☀' : '🌙'}
          </button>
        </nav>
      </header>

      <main>
        <section className="ap-hero" aria-labelledby="hero-title">
          <p className="ap-eyebrow">syncsim · the approach</p>
          <h1 id="hero-title" className="ap-hero__title">
            Two phones edit the same record offline. When they reconnect, whose edit survives?
          </h1>
          <p className="ap-hero__sub">
            I built a sync engine that merges offline edits in three different ways, and a simulator that breaks the
            network on purpose so you can watch each one keep or lose work. This page explains how it works and how I
            know it works.
          </p>
          <nav className="ap-toc" aria-label="On this page">
            {CONTENTS.map((c, i) => (
              <a key={c.id} href={`#${c.id}`}>
                <span className="ap-toc__n">{i + 1}</span>
                {c.label}
              </a>
            ))}
          </nav>
        </section>

        <ProblemSection />
        <ClocksSection />
        <KeyIdeaSection />
        <StrategiesSection />
        <CrdtSection />
        <TestingSection />
        <StillHardSection />
      </main>

      <footer className="ap-footer">
        <p>
          The full technical reference is <a href={APPROACH_DOC_URL}>APPROACH.md</a>. Every problem I hit while building
          it, and how I solved it, is in <a href={JOURNAL_DOC_URL}>JOURNAL.md</a>.
        </p>
        <p>
          <a href={PLAYGROUND_URL}>Open the playground</a> · <a href={REPO_URL}>Source on GitHub</a> · Built by{' '}
          <a href={PORTFOLIO_URL}>Hemant Singh Yadav</a>
        </p>
      </footer>
    </div>
  )
}
