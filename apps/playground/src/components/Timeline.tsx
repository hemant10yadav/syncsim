import type { NodeId, Simulation } from '@syncsim/engine'
import { collectTraffic, type Flight } from '../flights'
import { useWidth } from '../useWidth'
import { DEVICES } from '../world'

const HEIGHT = 190
const RIGHT = 16
const TOP = 26
const LANE_GAP = 60
/** Below this width, lanes get one-letter labels and a shorter window. */
const COMPACT_WIDTH = 560

const laneY = (id: NodeId) => TOP + DEVICES.findIndex((d) => d.id === id) * LANE_GAP

/**
 * Sequence diagram of the last few seconds of virtual time: one lane per phone,
 * every message drawn from sender to receiver, edits as dots.
 */
export function Timeline({ sim }: { sim: Simulation }) {
  const [width, ref] = useWidth<HTMLDivElement>()
  const compact = width < COMPACT_WIDTH
  const windowMs = compact ? 8_000 : 15_000
  const left = compact ? 28 : 76
  const now = sim.now
  const start = now - windowMs
  const x = (t: number) => left + ((t - start) / windowMs) * (width - left - RIGHT)
  const ticks = compact ? [0, 4_000, 8_000] : [0, 5_000, 10_000, 15_000]

  const { flights, blocked, edits } = collectTraffic(sim.events, start - sim.conditions.maxLatencyMs, now)

  return (
    <div ref={ref} className="timeline">
      {width > 0 && (
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Messages between phones over the last ${windowMs / 1000} seconds`}
        >
          <defs>
            <clipPath id="tl-plot">
              <rect x={left} y={0} width={Math.max(0, width - left)} height={HEIGHT} />
            </clipPath>
          </defs>
          {ticks.map((ago) => (
            <g key={ago}>
              <line className="tl-tick" x1={x(now - ago)} x2={x(now - ago)} y1={TOP - 14} y2={HEIGHT - 8} />
              <text className="tl-axis" x={x(now - ago)} y={TOP - 16} textAnchor="middle">
                {ago === 0 ? 'now' : `−${ago / 1000}s`}
              </text>
            </g>
          ))}

          {DEVICES.map((d) => (
            <g key={d.id}>
              <line
                className={`tl-lane${sim.isOnline(d.id) ? '' : ' tl-lane--offline'}`}
                x1={left}
                x2={width - RIGHT}
                y1={laneY(d.id)}
                y2={laneY(d.id)}
              />
              <text className="tl-label" x={12} y={laneY(d.id) + 4}>
                {compact ? d.id : d.label}
              </text>
            </g>
          ))}

          <g clipPath="url(#tl-plot)">
            {flights.map((f) => (
              <FlightLine key={f.message.id} flight={f} now={now} x={x} />
            ))}

            {blocked.map((e) => (
              <Cross key={`b${e.message.id}`} cx={x(e.at)} cy={laneY(e.message.from)} />
            ))}

            {edits.map((e) => (
              <circle key={e.op.id} className="tl-edit" cx={x(e.at)} cy={laneY(e.op.node)} r={5} />
            ))}
          </g>
        </svg>
      )}
      <ul className="legend">
        <li><span className="legend__swatch legend__swatch--edit" /> edit</li>
        <li><span className="legend__swatch legend__swatch--request" /> sync request</li>
        <li><span className="legend__swatch legend__swatch--response" /> response with new edits</li>
        <li><span className="legend__swatch legend__swatch--empty" /> response, nothing new</li>
        <li><span className="legend__swatch legend__swatch--dup" /> duplicate</li>
        <li><span className="legend__cross">×</span> lost or blocked</li>
      </ul>
    </div>
  )
}

function FlightLine({ flight, now, x }: { flight: Flight; now: number; x: (t: number) => number }) {
  const { message, outcome } = flight
  const y1 = laneY(message.from)
  const y2 = laneY(message.to)
  const x1 = x(message.sentAt)

  // A message lost at the moment it was sent has no travel time; draw a short stub.
  const lostAtSend = outcome.kind === 'dropped' && message.deliverAt === message.sentAt
  const endT = lostAtSend ? message.sentAt : Math.min(message.deliverAt, now)
  const progress = lostAtSend
    ? 0.25
    : message.deliverAt === message.sentAt
      ? 1
      : (endT - message.sentAt) / (message.deliverAt - message.sentAt)
  const x2 = lostAtSend ? x1 + 14 : x(endT)
  const y = y1 + (y2 - y1) * progress

  const isResponse = message.payload.kind === 'sync-response'
  const className = [
    'tl-msg',
    isResponse ? (outcome.kind === 'delivered' && outcome.applied > 0 ? 'tl-msg--response' : 'tl-msg--empty') : 'tl-msg--request',
    message.duplicate ? 'tl-msg--dup' : '',
    outcome.kind === 'dropped' ? 'tl-msg--dropped' : '',
  ].join(' ')

  return (
    <g>
      <line className={className} x1={x1} y1={y1} x2={x2} y2={y} />
      {outcome.kind === 'dropped' && <Cross cx={x2} cy={y} />}
      {outcome.kind === 'in-flight' && <circle className="tl-head" cx={x2} cy={y} r={3} />}
    </g>
  )
}

function Cross({ cx, cy }: { cx: number; cy: number }) {
  const s = 4
  return (
    <path className="tl-cross" d={`M${cx - s} ${cy - s} L${cx + s} ${cy + s} M${cx - s} ${cy + s} L${cx + s} ${cy - s}`} />
  )
}
