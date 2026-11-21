import type { ReactNode } from 'react'
import { Inbox } from 'lucide-react'
import { cn } from '@/lib/utils'

type Props = {
  title?: string
  description?: string
  icon?: ReactNode
  action?: ReactNode
  className?: string
}

export function EmptyState({ title = 'Brak danych', description, icon, action, className }: Props) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-2 py-10 text-center', className)}>
      <div className="bg-muted text-muted-foreground mb-1 rounded-full p-3">{icon ?? <Inbox className="size-6" />}</div>
      <p className="font-medium">{title}</p>
      {description && <p className="text-muted-foreground max-w-sm text-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  )
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border p-4 text-sm">
      <p className="font-medium">Coś poszło nie tak</p>
      <p className="mt-1 break-all opacity-80">{message}</p>
      {onRetry && (
        <button onClick={onRetry} className="mt-2 font-medium underline underline-offset-4">
          Spróbuj ponownie
        </button>
      )}
    </div>
  )
}
