import type { Conflict, FieldName, FieldValue, NodeId, Replica } from '@syncsim/engine'
import { useState, type ReactNode } from 'react'
import { formatClock } from '../format'
import { CASE, SKEW_OPTIONS, STATUS_OPTIONS, TAG_OPTIONS } from '../world'
import { EditLog } from './EditLog'
import { WhyPanel } from './WhyPanel'

/** What a phone panel shows. The same panel renders a simulated device or a real browser tab. */
export interface PhoneView {
  readonly title: string
  readonly replica: Replica
  readonly online: boolean
  /** Omitted for a device on a real clock, which hides the clock control. */
  readonly clockSkew?: number
  /** The device's own clock reading in ms, shown in its status bar. */
  readonly clock?: number
  /** Extra status text, such as how many peers a tab can see. */
  readonly detail?: string
  readonly labelFor: (node: NodeId) => string
}

/** Edits to the patient case, and device controls. */
export interface PhoneActions {
  setOnline(online: boolean): void
  setClockSkew?(skewMs: number): void
  set(field: FieldName, value: FieldValue): void
  increment(field: FieldName): void
  addElement(field: FieldName, element: string): void
  removeElement(field: FieldName, element: string): void
}

export function Phone({ view, actions }: { view: PhoneView; actions: PhoneActions }) {
  const { title, replica, online, clockSkew, clock, detail, labelFor } = view
  const [why, setWhy] = useState<FieldName | null>(null)
  const label = (field: FieldName, text: string, badge?: ReactNode) => (
    <FieldLabel
      text={text}
      badge={badge}
      open={why === field}
      lost={replica.explain(CASE, field).filter((e) => e.verdict.kind === 'lost').length}
      phone={title}
      onToggle={() => setWhy(why === field ? null : field)}
    />
  )
  const whyFor = (field: FieldName) => why === field && <WhyPanel replica={replica} field={field} labelFor={labelFor} />
  const conflicts = replica.conflicts().filter((c) => c.record === CASE)
  const conflictOn = (field: FieldName) => conflicts.find((c) => c.field === field)

  const name = asString(replica.value(CASE, 'name'))
  const status = asString(replica.value(CASE, 'status'))
  const visits = replica.value(CASE, 'visits')
  const tags = asList(replica.value(CASE, 'tags'))
  const statusWriter = replica.winner(CASE, 'status')?.node

  return (
    <article className={`phone${online ? '' : ' phone--offline'}`} aria-label={title}>
      <div className="phone__statusbar" aria-hidden>
        <span className="mono">{clock !== undefined ? formatClock(clock) : ''}</span>
        <span className="phone__notch" />
        <Signal online={online} />
      </div>
      <header className="phone__header">
        <div>
          <h2 className="phone__title">{title}</h2>
          <p className="phone__meta">
            <span className={`dot${online ? ' dot--on' : ''}`} aria-hidden />
            {online ? 'Online' : 'Offline'} · holds {replica.missingFor({}).length} edits
            {detail && ` · ${detail}`}
          </p>
        </div>
        <button type="button" className="btn btn--small" onClick={() => actions.setOnline(!online)}>
          {online ? 'Go offline' : 'Go online'}
        </button>
      </header>

      {clockSkew !== undefined && actions.setClockSkew && (
        <label className="phone__clock">
          <span>Clock</span>
          <select value={clockSkew} onChange={(e) => actions.setClockSkew?.(Number(e.target.value))}>
            {SKEW_OPTIONS.map((o) => (
              <option key={o.ms} value={o.ms}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="field">
        <Flash on={replica.value(CASE, 'name')} />
        {label('name', 'Patient')}
        <TextField
          value={name}
          label={`Patient name on ${title}`}
          onCommit={(v) => actions.set('name', v)}
        />
        <ConflictPicker conflict={conflictOn('name')} labelFor={labelFor} onPick={(v) => actions.set('name', v)} />
        {whyFor('name')}
      </div>

      <div className="field">
        <Flash on={replica.value(CASE, 'status')} />
        {label('status', 'Status')}
        <select
          aria-label={`Status on ${title}`}
          value={status}
          onChange={(e) => actions.set('status', e.target.value)}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {statusWriter && !conflictOn('status') && (
          <span className="field__hint">set by {labelFor(statusWriter)}</span>
        )}
        <ConflictPicker conflict={conflictOn('status')} labelFor={labelFor} onPick={(v) => actions.set('status', v)} />
        {whyFor('status')}
      </div>

      <div className="field">
        <Flash on={replica.value(CASE, 'visits')} />
        {label('visits', 'Visits', <KindBadge crdt={replica.kindOf('visits') === 'counter'} crdtName="counter" />)}
        <div className="field__row">
          <span className="visits">{typeof visits === 'number' ? visits : 0}</span>
          <button type="button" className="btn btn--small" onClick={() => actions.increment('visits')}>
            +1 visit
          </button>
        </div>
        {whyFor('visits')}
      </div>

      <div className="field">
        <Flash on={replica.value(CASE, 'tags')} />
        {label('tags', 'Tags', <KindBadge crdt={replica.kindOf('tags') === 'set'} crdtName="set" />)}
        <ul className="tags">
          {tags.map((tag) => (
            <li key={tag} className="tag">
              {tag}
              <button
                type="button"
                className="tag__remove"
                aria-label={`Remove ${tag} on ${title}`}
                onClick={() => actions.removeElement('tags', tag)}
              >
                ×
              </button>
            </li>
          ))}
          {tags.length === 0 && <li className="field__hint">no tags</li>}
        </ul>
        <div className="tags tags--add">
          {TAG_OPTIONS.filter((t) => !tags.includes(t)).map((tag) => (
            <button
              key={tag}
              type="button"
              className="chip"
              onClick={() => actions.addElement('tags', tag)}
            >
              + {tag}
            </button>
          ))}
        </div>
        {whyFor('tags')}
      </div>
      <EditLog replica={replica} labelFor={labelFor} />
    </article>
  )
}

function TextField({ value, label, onCommit }: { value: string; label: string; onCommit: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null)
  const commit = () => {
    if (draft !== null && draft !== value) onCommit(draft)
    setDraft(null)
  }
  return (
    <input
      aria-label={label}
      value={draft ?? value}
      onFocus={() => setDraft(value)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
        if (e.key === 'Escape') {
          setDraft(null)
          e.currentTarget.blur()
        }
      }}
    />
  )
}

interface ConflictPickerProps {
  conflict: Conflict | undefined
  labelFor: (node: NodeId) => string
  onPick: (v: string) => void
}

function ConflictPicker({ conflict, labelFor, onPick }: ConflictPickerProps) {
  if (!conflict) return null
  return (
    <div className="conflict" role="group" aria-label="Conflicting versions">
      <span className="conflict__title">{conflict.candidates.length} versions. Keep one:</span>
      {conflict.candidates.map((op) => (
        <button key={op.id} type="button" className="chip chip--conflict" onClick={() => onPick(asString(op.change.value))}>
          “{asString(op.change.value)}” <span className="chip__from">{labelFor(op.node)}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * A highlight that plays whenever `on` changes: keyed by the value, so React mounts
 * a fresh element and its CSS animation runs once. Only the overlay remounts, so
 * the field's inputs keep focus.
 */
function Flash({ on }: { on: unknown }) {
  return <span key={JSON.stringify(on) ?? 'none'} className="field__flash" aria-hidden />
}

function Signal({ online }: { online: boolean }) {
  if (!online) return <span className="phone__signal phone__signal--off">no signal</span>
  return (
    <svg className="phone__signal" width="18" height="12" viewBox="0 0 18 12">
      {[0, 1, 2, 3].map((i) => (
        <rect key={i} x={i * 5} y={9 - i * 3} width="3" height={3 + i * 3} rx="1" />
      ))}
    </svg>
  )
}

interface FieldLabelProps {
  text: string
  badge?: ReactNode
  open: boolean
  /** Edits to this field that last-write-wins discarded without a conflict. */
  lost: number
  phone: string
  onToggle: () => void
}

function FieldLabel({ text, badge, open, lost, phone, onToggle }: FieldLabelProps) {
  return (
    <div className="field__label">
      <span>{text}</span>
      {badge}
      <button
        type="button"
        className={`why-toggle${lost > 0 ? ' why-toggle--lost' : ''}`}
        aria-expanded={open}
        aria-label={`Explain the ${text.toLowerCase()} value on ${phone}.${lost > 0 ? ` ${lost} edit${lost === 1 ? '' : 's'} silently lost.` : ''}`}
        onClick={onToggle}
      >
        {lost > 0 ? `why? · ${lost} lost` : 'why?'}
      </button>
    </div>
  )
}

function KindBadge({ crdt, crdtName }: { crdt: boolean; crdtName: string }) {
  return <span className={`badge${crdt ? ' badge--crdt' : ''}`}>{crdt ? crdtName : 'plain value'}</span>
}

const asString = (v: FieldValue | undefined) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const asList = (v: FieldValue | undefined): readonly string[] => (Array.isArray(v) ? v : [])
