import { useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { pl } from 'react-day-picker/locale'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'

export const toIso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fromIso = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

type Props = {
  value: string // YYYY-MM-DD
  onChange: (iso: string) => void
  min: string
  max: string
  /** today (YYYY-MM-DD); days after it are forecasts */
  today: string
  className?: string
  id?: string
}

/** shadcn date picker (Popover + Calendar), Polish locale, month/year dropdowns for quick jumps across 10 years (and up to 16 days ahead). */
export function DatePicker({ value, onChange, min, max, today, className, id }: Props) {
  const [open, setOpen] = useState(false)
  const selected = value ? fromIso(value) : undefined
  const minD = fromIso(min)
  const maxD = fromIso(max)
  const isToday = value === today
  const isFuture = value > today

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            id={id}
            variant="outline"
            className={cn('h-10 w-full justify-start gap-2 px-3 font-normal', !value && 'text-muted-foreground', className)}
          />
        }
      >
        <CalendarDays className="text-muted-foreground size-4" aria-hidden />
        {selected ? formatDate(selected) : 'Wybierz datę'}
        {isToday && <span className="text-muted-foreground ml-auto text-xs">dziś</span>}
        {isFuture && <span className="text-muted-foreground ml-auto text-xs">prognoza</span>}
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          locale={pl}
          selected={selected}
          defaultMonth={selected}
          captionLayout="dropdown"
          startMonth={minD}
          endMonth={maxD}
          disabled={{ before: minD, after: maxD }}
          onSelect={(d) => {
            if (d) {
              onChange(toIso(d))
              setOpen(false)
            }
          }}
        />
        <div className="flex justify-end gap-2 border-t p-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              onChange(today)
              setOpen(false)
            }}
          >
            Dziś
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}
