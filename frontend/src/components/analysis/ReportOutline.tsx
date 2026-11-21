import { useEffect, useState } from 'react'
import { ArrowUp } from 'lucide-react'
import { cn } from '@/lib/utils'

export type OutlineItem = { id: string; label: string }

const prefersReducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * Vertical "scrollspy" outline: dots on a line, the active section follows the scroll position,
 * the line fills up as you read, click = smooth scroll. Desktop only (hidden on narrow screens).
 */
export function ReportOutline({ items }: { items: OutlineItem[] }) {
  const [active, setActive] = useState(0)

  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      const line = window.innerHeight * 0.35 // a section becomes active when its top passes 35% of the viewport
      let idx = 0
      items.forEach((it, i) => {
        const el = document.getElementById(it.id)
        if (el && el.getBoundingClientRect().top <= line) idx = i
      })
      // at the very bottom, highlight the last section even if it's short
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) idx = items.length - 1
      setActive(idx)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [items])

  const go = (id: string) => {
    const el = document.getElementById(id)
    if (!el) return
    el.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    history.replaceState(null, '', `${location.pathname}${location.search}#${id}`)
  }

  const progress = items.length > 1 ? (active / (items.length - 1)) * 100 : 0

  return (
    <nav aria-label="Spis treści raportu" className="no-print sticky top-6 hidden self-start xl:block">
      <ol className="relative">
        {/* track + progress */}
        <span aria-hidden className="bg-border absolute top-2 bottom-2 left-[9px] w-px" />
        <span
          aria-hidden
          className="bg-primary absolute top-2 left-[9px] w-px transition-[height] duration-500 ease-out motion-reduce:transition-none"
          style={{ height: `calc((100% - 1rem) * ${progress / 100})` }}
        />
        {items.map((it, i) => {
          const state = i < active ? 'done' : i === active ? 'active' : 'todo'
          return (
            <li key={it.id}>
              <button
                type="button"
                onClick={() => go(it.id)}
                aria-current={state === 'active' ? 'true' : undefined}
                className="group focus-visible:ring-ring/50 flex w-full items-center gap-3 rounded-md py-1.5 pr-2 text-left text-sm outline-none focus-visible:ring-[3px]"
              >
                <span className="relative grid size-[19px] shrink-0 place-items-center">
                  {state === 'active' && (
                    <span aria-hidden className="bg-primary/20 absolute inset-0 animate-ping rounded-full [animation-duration:2s] motion-reduce:hidden" />
                  )}
                  <span
                    aria-hidden
                    className={cn(
                      'relative rounded-full border-2 transition-all duration-300',
                      state === 'active' && 'bg-primary border-primary ring-primary/15 size-[13px] ring-4',
                      state === 'done' && 'bg-primary border-primary size-[9px]',
                      state === 'todo' && 'bg-background border-muted-foreground/40 group-hover:border-primary size-[9px]',
                    )}
                  />
                </span>
                <span
                  className={cn(
                    'transition-colors',
                    state === 'active' ? 'text-foreground font-semibold' : 'text-muted-foreground group-hover:text-foreground',
                  )}
                >
                  {it.label}
                </span>
              </button>
            </li>
          )
        })}
      </ol>
      <button
        type="button"
        onClick={() => window.scrollTo({ top: 0, behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}
        className="text-muted-foreground hover:text-foreground mt-4 ml-7 flex items-center gap-1.5 text-xs transition-colors"
      >
        <ArrowUp className="size-3.5" aria-hidden /> Do góry
      </button>
    </nav>
  )
}
