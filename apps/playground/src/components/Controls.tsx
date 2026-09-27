import { REGISTER_STRATEGIES, type RegisterStrategy } from '@syncsim/engine'
import type { ReactNode } from 'react'
import type { SimulationControls } from '../useSimulation'
import { PARTITIONS, randomSeed, type FieldMode, type PartitionId } from '../world'

const STRATEGY_INFO: Record<RegisterStrategy, { label: string; note: string }> = {
  'lww-wall': {
    label: 'Device clock wins',
    note: 'Latest device clock wins. Set a phone’s clock 1 h fast and its old edits beat newer ones.',
  },
  'lww-hlc': {
    label: 'Logical clock wins',
    note: 'An edit made after seeing another one wins. Truly concurrent edits: one is silently dropped.',
  },
  'multi-value': {
    label: 'Keep conflicts',
    note: 'Concurrent edits are all kept and shown as a conflict until someone picks one.',
  },
}

const MODE_INFO: Record<FieldMode, { label: string; note: string }> = {
  plain: {
    label: 'Plain values',
    note: 'Visits and tags are read, changed and written back, like a typical app. Concurrent edits overwrite each other.',
  },
  crdt: {
    label: 'CRDTs',
    note: 'Visits is a counter and tags a set. Concurrent edits all survive.',
  },
}

const SPEEDS = [0.5, 1, 2, 4] as const

export function Controls({ controls }: { controls: SimulationControls }) {
  const { sim, setup, reset, act, network, setNetwork } = controls

  return (
    <section className="controls" aria-label="Simulation controls">
      <Group title="Playback">
        <div className="row">
          <button type="button" className="btn" onClick={() => controls.setRunning(!controls.running)}>
            {controls.running ? 'Pause' : 'Play'}
          </button>
          <Segmented
            label="Speed"
            options={SPEEDS.map((s) => ({ value: s, label: `${s}×` }))}
            value={controls.speed}
            onChange={controls.setSpeed}
          />
        </div>
        <div className="row">
          <label className="check">
            <input
              type="checkbox"
              checked={controls.autoSync}
              onChange={(e) => controls.setAutoSync(e.target.checked)}
            />
            Auto-sync
          </label>
          <button type="button" className="btn" onClick={() => act((s) => s.gossip())}>
            Sync now
          </button>
        </div>
        <div className="row">
          <button type="button" className="btn" onClick={() => reset()}>
            Reset
          </button>
          <button type="button" className="btn" onClick={() => reset({ ...setup, seed: randomSeed() })}>
            New seed
          </button>
        </div>
      </Group>

      <Group title="Merge strategy" note={STRATEGY_INFO[controls.strategy].note}>
        <Segmented
          label="Merge strategy"
          options={REGISTER_STRATEGIES.map((s) => ({ value: s, label: STRATEGY_INFO[s].label }))}
          columns={1}
          value={controls.strategy}
          onChange={controls.setStrategy}
        />
      </Group>

      <Group title="Visits and tags" note={`${MODE_INFO[setup.mode].note} Switching resets the demo.`}>
        <Segmented
          label="Field types"
          options={(['plain', 'crdt'] as const).map((m) => ({ value: m, label: MODE_INFO[m].label }))}
          value={setup.mode}
          onChange={(mode) => reset({ ...setup, mode })}
        />
      </Group>

      <Group title="Network">
        <Slider
          label="Delay"
          value={network.maxLatencyMs}
          min={0}
          max={3_000}
          step={100}
          format={(v) => `${(Math.round(v / 4) / 1000).toFixed(1)}–${(v / 1000).toFixed(1)} s`}
          onChange={(v) => setNetwork({ minLatencyMs: Math.round(v / 4), maxLatencyMs: v })}
        />
        <Slider
          label="Lost"
          value={network.dropRate}
          min={0}
          max={0.6}
          step={0.05}
          format={percent}
          onChange={(v) => setNetwork({ dropRate: v })}
        />
        <Slider
          label="Duplicated"
          value={network.duplicateRate}
          min={0}
          max={0.5}
          step={0.05}
          format={percent}
          onChange={(v) => setNetwork({ duplicateRate: v })}
        />
      </Group>

      <Group title="Partition" note="Groups on either side of the bar cannot reach each other.">
        <Segmented
          label="Partition"
          options={(Object.keys(PARTITIONS) as PartitionId[]).map((p) => ({ value: p, label: PARTITIONS[p].label }))}
          columns={2}
          value={controls.partition}
          onChange={controls.setPartition}
        />
      </Group>

      <p className="controls__footer">
        {sim.inFlight().length} messages in flight
      </p>
    </section>
  )
}

function Group({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <fieldset className="group">
      <legend className="group__title">{title}</legend>
      {children}
      {note && <p className="group__note">{note}</p>}
    </fieldset>
  )
}

interface SegmentedProps<T> {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** Defaults to one column per option. */
  columns?: number
}

function Segmented<T extends string | number>({ label, options, value, onChange, columns }: SegmentedProps<T>) {
  return (
    <div
      className="segmented"
      role="group"
      aria-label={label}
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={o.value === value}
          className="segmented__option"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

interface SliderProps {
  label: string
  value: number
  min: number
  max: number
  step: number
  format: (value: number) => string
  onChange: (value: number) => void
}

function Slider({ label, value, min, max, step, format, onChange }: SliderProps) {
  return (
    <label className="slider">
      <span className="slider__label">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="slider__value">{format(value)}</span>
    </label>
  )
}

const percent = (v: number) => `${Math.round(v * 100)}%`
