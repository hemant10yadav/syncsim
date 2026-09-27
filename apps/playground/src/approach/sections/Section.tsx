import type { ReactNode } from 'react'

interface SectionProps {
  id: string
  number: number
  title: string
  /** One line a skimming reader should leave with. */
  takeaway: string
  children: ReactNode
}

export function Section({ id, number, title, takeaway, children }: SectionProps) {
  return (
    <section id={id} className="ap-section" aria-labelledby={`${id}-title`}>
      <p className="ap-eyebrow">
        <span className="ap-eyebrow__n">{String(number).padStart(2, '0')}</span> {takeaway}
      </p>
      <h2 id={`${id}-title`} className="ap-section__title">
        {title}
      </h2>
      {children}
    </section>
  )
}
