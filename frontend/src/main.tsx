import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from 'next-themes'
import { TooltipProvider } from '@/components/ui/tooltip'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* toggles the `.dark` class on <html>; remembers the choice in localStorage */}
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <TooltipProvider delay={150}>
        <App />
      </TooltipProvider>
    </ThemeProvider>
  </StrictMode>,
)
