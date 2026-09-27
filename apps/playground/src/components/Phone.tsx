import type { Conflict, FieldName, FieldValue, NodeId, Simulation } from '@syncsim/engine'
import { useState } from 'react'
import { CASE, deviceLabel, SKEW_OPTIONS, STATUS_OPTIONS, TAG_OPTIONS, type FieldMode } from '../world'

interface PhoneProps {
  sim: Simulation
  id: NodeId
  mode: FieldMode
  act: (change: (sim: Simulation) => void) => void
}

export function Phone({ sim, id, mode, act }: PhoneProps) {
  const replica = sim.replica(id)
  const online = sim.isOnline(id)
  const skew = sim.clockSkew(id)
  const conflicts = replica.conflicts().filter((c) => c.record === CASE)
  const conflictOn = (field: FieldName) => conflicts.find((c) => c.field === field)

  const name = asString(replica.value(CASE, 'name'))
  const status = asString(replica.value(CASE, 'status'))
  const visits = replica.value(CASE, 'visits')
  const tags = asList(replica.value(CASE, 'tags'))
  const statusWriter = replica.winner(CASE, 'status')?.node

  return (
    <article className={`phone${online ? '' : ' phone--offline'}`} aria-label={deviceLabel(id)}>
      <header className="phone__header">
        <div>
          <h2 className="phone__title">{deviceLabel(id)}</h2>
          <p className="phone__meta">
            <span className={`dot${online ? ' dot--on' : ''}`} aria-hidden />
            {online ? 'Online' : 'Offline'} · holds {replica.missingFor({}).length} edits
          </p>
        </div>
        <button
          type="button"
          className="btn btn--small"
          onClick={() => act((s) => s.setOnline(id, !online))}
        >
          {online ? 'Go offline' : 'Go online'}
        </button>
      </header>

      <label className="phone__clock">
        <span>Clock</span>
        <select
          value={skew}
          onChange={(e) => act((s) => s.setClockSkew(id, Number(e.target.value)))}
        >
          {SKEW_OPTIONS.map((o) => (
            <option key={o.ms} value={o.ms}>
              {o.label}
            </option>
          ))}
        </select>
      </label>

      <div className="field">
        <span className="field__label">Patient</span>
        <TextField
          value={name}
          label={`Patient name on ${deviceLabel(id)}`}
          onCommit={(v) => act((s) => s.edit(id, CASE, 'name', v))}
        />
        <ConflictPicker conflict={conflictOn('name')} onPick={(v) => act((s) => s.edit(id, CASE, 'name', v))} />
      </div>

      <div className="field">
        <span className="field__label">Status</span>
        <select
          aria-label={`Status on ${deviceLabel(id)}`}
          value={status}
          onChange={(e) => act((s) => s.edit(id, CASE, 'status', e.target.value))}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
        {statusWriter && !conflictOn('status') && (
          <span className="field__hint">set by {deviceLabel(statusWriter)}</span>
        )}
        <ConflictPicker
          conflict={conflictOn('status')}
          onPick={(v) => act((s) => s.edit(id, CASE, 'status', v))}
        />
      </div>

      <div className="field">
        <span className="field__label">
          Visits <KindBadge crdt={mode === 'crdt'} crdtName="counter" />
        </span>
        <div className="field__row">
          <span className="visits">{typeof visits === 'number' ? visits : 0}</span>
          <button type="button" className="btn btn--small" onClick={() => act((s) => s.increment(id, CASE, 'visits'))}>
            +1 visit
          </button>
        </div>
      </div>

      <div className="field">
        <span className="field__label">
          Tags <KindBadge crdt={mode === 'crdt'} crdtName="set" />
        </span>
        <ul className="tags">
          {tags.map((tag) => (
            <li key={tag} className="tag">
              {tag}
              <button
                type="button"
                className="tag__remove"
                aria-label={`Remove ${tag} on ${deviceLabel(id)}`}
                onClick={() => act((s) => s.removeElement(id, CASE, 'tags', tag))}
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
              onClick={() => act((s) => s.addElement(id, CASE, 'tags', tag))}
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>
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

function ConflictPicker({ conflict, onPick }: { conflict: Conflict | undefined; onPick: (v: string) => void }) {
  if (!conflict) return null
  return (
    <div className="conflict" role="group" aria-label="Conflicting versions">
      <span className="conflict__title">{conflict.candidates.length} versions. Keep one:</span>
      {conflict.candidates.map((op) => (
        <button key={op.id} type="button" className="chip chip--conflict" onClick={() => onPick(asString(op.change.value))}>
          “{asString(op.change.value)}” <span className="chip__from">{deviceLabel(op.node)}</span>
        </button>
      ))}
    </div>
  )
}

function KindBadge({ crdt, crdtName }: { crdt: boolean; crdtName: string }) {
  return <span className={`badge${crdt ? ' badge--crdt' : ''}`}>{crdt ? crdtName : 'plain value'}</span>
}

const asString = (v: FieldValue | undefined) => (typeof v === 'string' ? v : v == null ? '' : String(v))
const asList = (v: FieldValue | undefined): readonly string[] => (Array.isArray(v) ? v : [])
