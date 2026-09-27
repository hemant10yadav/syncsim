import { REGISTER_STRATEGIES } from '@syncsim/engine'
import type { ReactNode } from 'react'
import { MODE_INFO, STRATEGY_INFO } from '../labels'
import type { SimulationControls } from '../useSimulation'
import { PARTITIONS, randomSeed, type PartitionId } from '../world'
import { Segmented } from './Segmented'

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
