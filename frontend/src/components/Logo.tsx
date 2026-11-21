import { cn } from '@/lib/utils'

/**
 * Retentoor mark: a drop of water held in a field basin (= retention).
 * Drawn on a 32×32 grid; uses currentColor so it follows the theme.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden fill="none">
      <path d="M16 4.5c-2.9 3.7-5.2 6.7-5.2 9.4a5.2 5.2 0 0 0 10.4 0c0-2.7-2.3-5.7-5.2-9.4Z" fill="currentColor" />
      <path d="M5.5 15.5c0 6.4 4.7 11.5 10.5 11.5s10.5-5.1 10.5-11.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
      <path d="M10 22.4h12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.55" />
    </svg>
  )
}

/** Mark on the brand tile + wordmark. */
export function Logo({ tagline = true, className }: { tagline?: boolean; className?: string }) {
  return (
    <span className={cn('flex items-center gap-2.5', className)}>
      <span className="bg-primary text-primary-foreground grid size-9 shrink-0 place-items-center rounded-md">
        <LogoMark className="size-6" />
      </span>
      <span className="leading-tight">
        <span className="block text-lg font-bold">
          Reten<span className="text-primary">too</span>r
        </span>
        {tagline && <span className="text-muted-foreground block text-xs">asystent retencji wody dla rolnika</span>}
      </span>
    </span>
  )
}
