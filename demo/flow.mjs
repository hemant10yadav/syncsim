// The syncsim walkthrough, as a ui-demo flow (~/.claude/skills/ui-demo). demo.sh copies this next to the skill's
// runner.mjs in ~/Desktop/record/syncsim-walkthrough and runs it; do not run it from here.
//
//   node flow.mjs           Verify Run: headless, every step asserted -> output/report.json
//   node flow.mjs --record  Record Pass -> output/raw.mp4 + output/steps.json
import { expect, run } from './runner.mjs'

const BASE = process.env.DEMO_BASE ?? 'http://localhost:5173/syncsim/'
// ?seed= skips the first-visit tour, so the walkthrough starts on the scenario list.
const START = `${BASE}?seed=7`

// 1600 × 830 comes out as exactly 16:9 (1760 × 990) once render.py adds its 5% frame on every side.
const VIEW = { width: 1600, height: 830 }
/** Page zoom for the recording: a little zoomed out, so each frame shows more of the page. */
const ZOOM = 0.9

const phone = (p, id) => p.getByRole('article', { name: `Phone ${id}` })
const status = (p, id) => p.getByLabel(`Status on Phone ${id}`, { exact: true })
const nextStep = (p) => p.getByRole('button', { name: 'Next step' })

/** Smooth-scroll an element into view and let the scroll finish before the next beat. */
async function scrollTo(p, selector, block = 'start') {
  await p.locator(selector).first().evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block)
  await p.waitForTimeout(700)
}

const INTRO = {
  title: 'Offline edits that don’t get lost',
  description: 'Two phones edit the same record offline. Most apps quietly drop one edit.',
}
const OUTRO = {
  title: 'Try it yourself',
  description: 'hemant10yadav.github.io/syncsim',
}

const STEPS = [
  {
    name: 'start-scenario',
    intent: 'Start a guided scenario',
    run: async (p, d) => {
      // The Record Pass has already opened START (firstUrl); the Verify Run starts on a blank page.
      if (!p.url().startsWith(BASE)) await d.goto(p, START)
      await d.click(p, p.getByRole('button', { name: /Two health workers edit the same case/ }))
      await scrollTo(p, '.scenario-player')
    },
    assert: (p) => expect(p.locator('.scenario-player')).toContainText('step 1 of 7'),
    caption: ['Three phones share one patient case', 'All three agree: the case is open'],
    checkpoint: '.network',
  },
  {
    name: 'go-offline',
    intent: 'Phones A and B lose signal',
    run: async (p, d) => {
      await d.click(p, nextStep(p))
    },
    assert: async (p) => {
      await expect(phone(p, 'A').locator('.phone__meta')).toContainText('Offline')
      await expect(phone(p, 'B').locator('.phone__meta')).toContainText('Offline')
    },
    caption: ['Two phones lose signal', 'Their links on the network turn red'],
    checkpoint: '.network',
  },
  {
    name: 'offline-edits',
    intent: 'Each worker changes the status',
    run: async (p, d) => {
      await d.click(p, nextStep(p))
      await d.pause(p, 900)
      await d.click(p, nextStep(p))
    },
    assert: async (p) => {
      await expect(status(p, 'A')).toHaveValue('visited')
      await expect(status(p, 'B')).toHaveValue('referred')
    },
    caption: ['Both edit the same field offline', 'A marks it visited, B marks it referred'],
    checkpoint: '.phones',
  },
  {
    name: 'reconnect',
    intent: 'Signal returns and the phones sync',
    run: async (p, d) => {
      await d.click(p, nextStep(p))
    },
    assert: async (p) => {
      await expect(p.getByRole('status')).toContainText('All phones in sync', { timeout: 10_000 })
      await expect(status(p, 'A')).toHaveValue('referred')
    },
    caption: ['One edit silently disappears', 'The later edit wins and nobody is told'],
    checkpoint: '.phones',
  },
  {
    name: 'why',
    intent: 'Ask Phone A why the status changed',
    run: async (p, d) => {
      await d.click(p, phone(p, 'A').getByRole('button', { name: /^Explain the status value/ }))
      await scrollTo(p, '.why__row--lost', 'center')
    },
    assert: (p) => expect(phone(p, 'A').locator('.why__row--lost')).toContainText('silently lost'),
    caption: ['The lost edit, explained', 'Struck through, with who overwrote it'],
    checkpoint: '.why',
  },
  {
    name: 'keep-conflicts',
    intent: 'Switch to Keep conflicts',
    run: async (p, d) => {
      await scrollTo(p, '.scenario-player')
      await d.click(p, nextStep(p))
      await scrollTo(p, '.phones', 'center')
    },
    assert: (p) => expect(p.getByRole('group', { name: 'Conflicting versions' })).toHaveCount(3),
    caption: ['Now both edits are kept', 'Every phone asks which one to keep'],
    checkpoint: '.phones',
  },
  {
    name: 'compare',
    intent: 'Compare the three rules',
    run: async (p, d) => {
      await scrollTo(p, '.compare', 'center')
      await d.pause(p, 600)
    },
    assert: (p) => expect(p.locator('.compare__table')).toContainText('1 silently'),
    caption: ['Same edits, three rules', 'See what each strategy keeps or loses'],
    checkpoint: '.compare',
  },
  {
    name: 'approach',
    intent: 'Read how it works',
    run: async (p, d) => {
      await d.goto(p, `${BASE}approach/`)
      await d.pause(p, 800)
      await scrollTo(p, '#key-idea')
      await d.click(p, p.getByRole('button', { name: 'Shuffle arrival order' }))
    },
    assert: (p) => expect(p.locator('.key__result')).toContainText('Same result'),
    caption: ['Order never changes the result', 'Each write records what it replaced'],
    checkpoint: '.key',
  },
]

await run(
  {
    BASE,
    INTRO,
    OUTRO,
    STEPS,
    VIEW,
    firstUrl: START,
    useState: false,
    // Runs before the first page loads; applies to every page the flow opens.
    preAuth: (p) =>
      p.addInitScript((zoom) => {
        document.addEventListener('DOMContentLoaded', () => {
          const style = document.createElement('style')
          style.textContent = `#root { zoom: ${zoom}; }`
          document.head.append(style)
        })
      }, ZOOM),
  },
  import.meta.url,
)
