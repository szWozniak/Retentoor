/** Polish-locale formatters. Use these everywhere instead of ad-hoc toFixed / toLocaleString. */

const LOCALE = 'pl-PL'

const nf = new Intl.NumberFormat(LOCALE)
const nfCompact = new Intl.NumberFormat(LOCALE, { notation: 'compact', maximumFractionDigits: 1 })
const pln = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'PLN', maximumFractionDigits: 0 })
const plnPrecise = new Intl.NumberFormat(LOCALE, { style: 'currency', currency: 'PLN' })
const pct = new Intl.NumberFormat(LOCALE, { style: 'percent', maximumFractionDigits: 1 })
const dateShort = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short' })
const date = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' })
const dateTime = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'medium', timeStyle: 'short' })
const rtf = new Intl.RelativeTimeFormat(LOCALE, { numeric: 'auto' })

type DateLike = Date | string | number
const toDate = (d: DateLike) => (d instanceof Date ? d : new Date(d))

export const formatNumber = (n: number) => nf.format(n)
/** 12 345 -> "12,3 tys." */
export const formatCompact = (n: number) => nfCompact.format(n)
export const formatPLN = (n: number, precise = false) => (precise ? plnPrecise : pln).format(n)
/** 0.123 -> "12,3%" */
export const formatPercent = (ratio: number) => pct.format(ratio)
export const formatDateShort = (d: DateLike) => dateShort.format(toDate(d))
export const formatDate = (d: DateLike) => date.format(toDate(d))
export const formatDateTime = (d: DateLike) => dateTime.format(toDate(d))
export const formatBytes = (b: number) =>
  b < 1024 ? `${b} B` : b < 1024 ** 2 ? `${(b / 1024).toFixed(1)} KB` : `${(b / 1024 ** 2).toFixed(1)} MB`

/** "3 minuty temu", "wczoraj", "za 2 dni" */
export function formatRelative(d: DateLike, now = new Date()) {
  const diffS = (toDate(d).getTime() - now.getTime()) / 1000
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000],
    ['month', 2592000],
    ['week', 604800],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]
  for (const [unit, s] of units) if (Math.abs(diffS) >= s) return rtf.format(Math.round(diffS / s), unit)
  return rtf.format(Math.round(diffS), 'second')
}
