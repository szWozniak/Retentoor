import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import { Monitor, Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'

const ORDER = ['light', 'dark', 'system'] as const
const META = {
  light: { icon: Sun, label: 'Jasny motyw' },
  dark: { icon: Moon, label: 'Ciemny motyw' },
  system: { icon: Monitor, label: 'Motyw systemowy' },
}

/** Cycles light → dark → system. */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const current = (mounted ? theme : 'system') as (typeof ORDER)[number]
  const next = ORDER[(ORDER.indexOf(current) + 1) % ORDER.length]
  const { icon: Icon, label } = META[current] ?? META.system

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => setTheme(next)}
      aria-label={`${label}. Kliknij, aby zmienić`}
      title={`${label} (kliknij: ${META[next].label.toLowerCase()})`}
    >
      <Icon />
    </Button>
  )
}
