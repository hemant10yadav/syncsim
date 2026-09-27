interface SegmentedProps<T> {
  label: string
  options: readonly { value: T; label: string }[]
  value: T
  onChange: (value: T) => void
  /** Defaults to one column per option. */
  columns?: number
}

export function Segmented<T extends string | number>({ label, options, value, onChange, columns }: SegmentedProps<T>) {
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
