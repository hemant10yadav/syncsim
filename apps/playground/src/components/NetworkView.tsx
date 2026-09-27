import type { NodeId, Simulation } from '@syncsim/engine'
import { collectTraffic, type Flight } from '../flights'
import { useWidth } from '../useWidth'
import { DEVICES, deviceLabel } from '../world'

const HEIGHT = 300
const NODE_R = 34
/** How long, in virtual ms, a pulse or a lost-message burst stays on screen. */
const FADE_MS = 900
/** Requests and replies travel on either side of a link so opposite dots do not overlap. */
const LANE_OFFSET = 5

interface Point {
  x: number
  y: number
}

/**
 * The phones as a network: links that break when a phone is offline or cut off,
 * messages travelling along them, bursts where messages are lost, and pulses where
 * edits are made or new edits arrive. Click a phone to take it offline or back.
 */
export function NetworkView({ sim, onToggle }: { sim: Simulation; onToggle: (node: NodeId) => void }) {
  const [width, ref] = useWidth<HTMLDivElement>()
  const now = sim.now
  const positions = layout(width)
  const at = (id: NodeId) => positions.get(id)!

  const { flights, blocked, edits } = collectTraffic(sim.events, now - sim.conditions.maxLatencyMs - FADE_MS, now)
  const recent = (t: number) => now - t <= FADE_MS
  const fade = (t: number) => 1 - (now - t) / FADE_MS

  const allOps = new Set<string>()
  for (const d of DEVICES) for (const op of sim.replica(d.id).missingFor({})) allOps.add(op.id)

  return (
    <section className="network" aria-label="Network between the phones">
      <div ref={ref} className="network__canvas">
        {width > 0 && (
          <svg width={width} height={HEIGHT} role="img" aria-label="Phones, the links between them, and messages in flight">
            {pairs().map(([a, b]) => {
              const up = sim.reachable(a, b)
              const p = at(a)
              const q = at(b)
              const mid = { x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 }
              return (
                <g key={`${a}${b}`}>
                  <line className={`net-link${up ? '' : ' net-link--down'}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y} />
                  {!up && (
                    <>
                      <Cross cx={mid.x} cy={mid.y} size={6} className="net-cross" />
                      <text className="net-link__label" x={mid.x} y={mid.y + 20} textAnchor="middle">
                        {!sim.isOnline(a) || !sim.isOnline(b) ? 'offline' : 'cut off'}
                      </text>
                    </>
                  )}
                </g>
              )
            })}

            {flights.map((f) => (
              <FlightMark key={f.message.id} flight={f} now={now} from={at(f.message.from)} to={at(f.message.to)} recent={recent} fade={fade} />
            ))}

            {blocked.filter((e) => recent(e.at)).map((e) => {
              const p = along(at(e.message.from), at(e.message.to), 0.22, 0)
              return <Cross key={`b${e.message.id}`} cx={p.x} cy={p.y} size={4} className="net-cross" opacity={fade(e.at)} />
            })}

            {DEVICES.map((d) => {
              const replica = sim.replica(d.id)
              const p = at(d.id)
              const online = sim.isOnline(d.id)
              const held = replica.missingFor({}).length
              const behind = allOps.size - held
              const editPulse = edits.filter((e) => e.op.node === d.id && recent(e.at)).at(-1)
              const arrival = flights
                .filter((f) => f.message.to === d.id && f.outcome.kind === 'delivered' && f.outcome.applied > 0 && recent(f.outcome.at))
                .at(-1)
              return (
                <g
                  key={d.id}
                  className={`net-node${online ? '' : ' net-node--offline'}`}
                  role="button"
                  tabIndex={0}
                  aria-label={`${d.label}: ${online ? 'online' : 'offline'}, ${behind === 0 ? 'up to date' : `missing ${behind} edits`}. Press to take ${online ? 'offline' : 'online'}.`}
                  onClick={() => onToggle(d.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onToggle(d.id)
                    }
                  }}
                >
                  {editPulse && <Pulse center={p} age={1 - fade(editPulse.at)} className="net-pulse--edit" />}
                  {arrival && arrival.outcome.kind === 'delivered' && (
                    <>
                      <Pulse center={p} age={1 - fade(arrival.outcome.at)} className="net-pulse--arrive" />
                      <text className="net-gain" x={p.x} y={p.y - NODE_R - 14 - (1 - fade(arrival.outcome.at)) * 12} textAnchor="middle" opacity={fade(arrival.outcome.at)}>
                        +{arrival.outcome.applied} {arrival.outcome.applied === 1 ? 'edit' : 'edits'}
                      </text>
                    </>
                  )}
                  <circle className="net-node__body" cx={p.x} cy={p.y} r={NODE_R} />
                  <text className="net-node__id" x={p.x} y={p.y + 7} textAnchor="middle">
                    {d.id}
                  </text>
                  <text className="net-node__label" x={p.x} y={p.y + NODE_R + 18} textAnchor="middle">
                    {online ? deviceLabel(d.id) : `${deviceLabel(d.id)} · no signal`}
                  </text>
                  <text className={`net-node__sync${behind > 0 ? ' is-behind' : ''}`} x={p.x} y={p.y + NODE_R + 34} textAnchor="middle">
                    {behind === 0 ? `up to date · ${held} edits` : `missing ${behind} ${behind === 1 ? 'edit' : 'edits'}`}
                  </text>
                </g>
              )
            })}
          </svg>
        )}
      </div>
      <ul className="legend">
        <li><span className="net-legend net-legend--request" /> asking for missing edits</li>
        <li><span className="net-legend net-legend--data" /> sending edits</li>
        <li><span className="net-legend net-legend--empty" /> nothing new to send</li>
        <li><span className="net-legend net-legend--dup" /> duplicate</li>
        <li><span className="legend__cross">×</span> lost or blocked</li>
        <li className="muted">Click a phone to take it offline.</li>
      </ul>
    </section>
  )
}

interface FlightMarkProps {
  flight: Flight
  now: number
  from: Point
  to: Point
  recent: (t: number) => boolean
  fade: (t: number) => number
}

function FlightMark({ flight, now, from, to, recent, fade }: FlightMarkProps) {
  const { message, outcome } = flight
  // Keep requests on one side of the link and replies on the other.
  const side = message.from < message.to ? 1 : -1
  const progressAt = (t: number) =>
    message.deliverAt === message.sentAt ? 0 : Math.min(1, Math.max(0, (t - message.sentAt) / (message.deliverAt - message.sentAt)))

  if (outcome.kind === 'dropped') {
    if (!recent(outcome.at)) return null
    // Lost the moment it was sent: show it just outside the sender.
    const t = message.deliverAt === message.sentAt ? 0.22 : progressAt(outcome.at)
    const p = along(from, to, t, side * LANE_OFFSET)
    return <Cross cx={p.x} cy={p.y} size={5} className="net-cross" opacity={fade(outcome.at)} />
  }
  if (outcome.kind !== 'in-flight') return null

  const p = along(from, to, progressAt(now), side * LANE_OFFSET)
  const payload = message.payload
  const kind = payload.kind === 'sync-request' ? 'request' : payload.ops.length > 0 ? 'data' : 'empty'
  const r = kind === 'data' ? 6 : kind === 'request' ? 4 : 3
  return (
    <circle
      className={`net-msg net-msg--${kind}${message.duplicate ? ' net-msg--dup' : ''}`}
      cx={p.x}
      cy={p.y}
      r={r}
    >
      <title>
        {payload.kind === 'sync-request'
          ? `${deviceLabel(message.from)} asks ${deviceLabel(message.to)} for missing edits`
          : `${deviceLabel(message.from)} sends ${payload.ops.length} edits to ${deviceLabel(message.to)}`}
        {message.duplicate ? ' (duplicate)' : ''}
      </title>
    </circle>
  )
}

function Pulse({ center, age, className }: { center: Point; age: number; className: string }) {
  return (
    <circle className={`net-pulse ${className}`} cx={center.x} cy={center.y} r={NODE_R + 4 + age * 22} opacity={1 - age} />
  )
}

function Cross({ cx, cy, size, className, opacity = 1 }: { cx: number; cy: number; size: number; className: string; opacity?: number }) {
  return (
    <path
      className={className}
      opacity={opacity}
      d={`M${cx - size} ${cy - size} L${cx + size} ${cy + size} M${cx - size} ${cy + size} L${cx + size} ${cy - size}`}
    />
  )
}

/** Phones on a triangle: A bottom left, B top, C bottom right. */
function layout(width: number): Map<NodeId, Point> {
  const pad = Math.min(90, Math.max(50, width * 0.12))
  const [a, b, c] = DEVICES
  return new Map([
    [a!.id, { x: pad, y: HEIGHT - 80 }],
    [b!.id, { x: width / 2, y: 58 }],
    [c!.id, { x: width - pad, y: HEIGHT - 80 }],
  ])
}

function pairs(): [NodeId, NodeId][] {
  const ids = DEVICES.map((d) => d.id)
  return ids.flatMap((a, i) => ids.slice(i + 1).map((b): [NodeId, NodeId] => [a, b]))
}

/** A point `t` of the way from `p` to `q`, shifted `offset` px to the side, stopping at the node edges. */
function along(p: Point, q: Point, t: number, offset: number): Point {
  const dx = q.x - p.x
  const dy = q.y - p.y
  const length = Math.hypot(dx, dy) || 1
  const ux = dx / length
  const uy = dy / length
  const start = NODE_R + 4
  const travel = Math.max(0, length - 2 * start)
  const d = start + travel * t
  return { x: p.x + ux * d - uy * offset, y: p.y + uy * d + ux * offset }
}
