import { useEffect, useRef, useState } from 'react'

/** The rendered width of an element, updated as it resizes. */
export function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry!.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [width, ref] as const
}
