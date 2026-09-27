/**
 * UI primitives.
 *
 * One file for the whole design system keeps spacing/radius/motion identical
 * everywhere. Each primitive is unopinionated about layout so pages compose
 * them freely.
 */
import { forwardRef, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { accent } from '../../lib/constants'
import { hashHue, initials, percentLabel } from '../../lib/format'

/* ------------------------------------------------------------------ Button */
const BUTTON_VARIANTS = {
  primary: 'btn-primary',
  ghost: 'btn-ghost',
  quiet: 'btn-quiet',
  danger: 'btn-danger',
}

const BUTTON_SIZES = {
  sm: 'px-3 py-1.5 text-[13px] rounded-lg gap-1.5',
  md: '',
  lg: 'px-6 py-3 text-[15px] rounded-2xl',
  icon: 'h-9 w-9 p-0 rounded-xl',
  'icon-sm': 'h-7 w-7 p-0 rounded-lg text-[12px]',
}

export const Button = forwardRef(function Button(
  { variant = 'primary', size = 'md', loading = false, className = '', children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={`${BUTTON_VARIANTS[variant] || BUTTON_VARIANTS.primary} ${
        BUTTON_SIZES[size] || ''
      } ${className}`}
      {...rest}
    >
      {loading && <Spinner size={14} />}
      {children}
    </button>
  )
})

export function Spinner({ size = 16, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={`animate-spin ${className}`}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" fill="none" opacity="0.22" />
      <path
        d="M21 12a9 9 0 0 0-9-9"
        stroke="currentColor"
        strokeWidth="2.5"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  )
}

/* -------------------------------------------------------------------- Card */
export function Card({ className = '', hover = false, glow, children, ...rest }) {
  return (
    <div
      className={`card min-w-0 ${hover ? 'transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lift' : ''} ${
        glow ? 'shadow-glow' : ''
      } ${className}`}
      {...rest}
    >
      {children}
    </div>
  )
}

export function CardHeader({ title, subtitle, action, icon, className = '' }) {
  return (
    <div className={`flex items-start justify-between gap-4 ${className}`}>
      <div className="flex min-w-0 items-start gap-3">
        {icon && (
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient-soft text-[15px] ring-1 ring-white/10">
            {icon}
          </span>
        )}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold tracking-tight">{title}</h3>
          {subtitle && <p className="mt-0.5 truncate text-[12.5px] text-3">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  )
}

/* ------------------------------------------------------------------- Badge */
export function Badge({ tone = 'slate', children, className = '', dot = false, size = 'md' }) {
  const tones = {
    slate: 'bg-slate-500/12 text-slate-300 ring-slate-400/20',
    violet: 'bg-violet-500/14 text-violet-300 ring-violet-400/25',
    brand: 'bg-brand-500/14 text-brand-300 ring-brand-400/25',
    emerald: 'bg-emerald-500/14 text-emerald-300 ring-emerald-400/25',
    amber: 'bg-amber-500/14 text-amber-300 ring-amber-400/25',
    rose: 'bg-rose-500/14 text-rose-300 ring-rose-400/25',
    sky: 'bg-sky-500/14 text-sky-300 ring-sky-400/25',
    pink: 'bg-pink-500/14 text-pink-300 ring-pink-400/25',
  }
  const dots = {
    slate: 'bg-slate-400', violet: 'bg-violet-400', brand: 'bg-brand-400',
    emerald: 'bg-emerald-400', amber: 'bg-amber-400', rose: 'bg-rose-400',
    sky: 'bg-sky-400', pink: 'bg-pink-400',
  }
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold ring-1 ring-inset ${
        size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-[11px]'
      } ${tones[tone] || tones.slate} ${className}`}
    >
      {dot && <span className={`h-1.5 w-1.5 rounded-full ${dots[tone] || dots.slate}`} />}
      {children}
    </span>
  )
}

/* ------------------------------------------------------------------ Avatar */
export function Avatar({ user, size = 40, className = '', ring = true, status }) {
  const name = user?.name || user?.username || '?'
  const src = user?.avatar_url
  const hue = hashHue(user?.username || name)
  const dimension = { width: size, height: size, fontSize: Math.max(10, size * 0.36) }
  return (
    <span className={`relative inline-flex shrink-0 ${className}`} style={dimension}>
      {src ? (
        <img
          src={src}
          alt={name}
          width={size}
          height={size}
          loading="lazy"
          className={`h-full w-full rounded-full object-cover ${ring ? 'ring-2 ring-white/10' : ''}`}
        />
      ) : (
        <span
          className={`grid h-full w-full place-items-center rounded-full font-bold text-white ${
            ring ? 'ring-2 ring-white/10' : ''
          }`}
          style={{
            background: `linear-gradient(135deg, hsl(${hue},70%,58%), hsl(${(hue + 55) % 360},68%,42%))`,
            fontSize: dimension.fontSize,
          }}
        >
          {initials(name)}
        </span>
      )}
      {status && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 block rounded-full ring-2 ring-[rgb(var(--page))] ${
            status === 'online' ? 'h-3 w-3 bg-emerald-400' : 'h-2.5 w-2.5 bg-slate-500'
          }`}
        />
      )}
    </span>
  )
}

/** Overlapping avatar stack, e.g. "Aisha, Marco and 4 others liked this". */
export function AvatarStack({ users = [], max = 4, size = 24 }) {
  const shown = users.slice(0, max)
  const extra = users.length - shown.length
  return (
    <div className="flex items-center">
      {shown.map((user, index) => (
        <span
          key={user.id || index}
          className="-ml-1.5 first:ml-0 rounded-full ring-2 ring-[rgb(var(--page))]"
        >
          <Avatar user={user} size={size} ring={false} />
        </span>
      ))}
      {extra > 0 && (
        <span
          className="-ml-1.5 grid place-items-center rounded-full bg-white/10 font-bold text-2 ring-2 ring-[rgb(var(--page))]"
          style={{ width: size, height: size, fontSize: size * 0.36 }}
        >
          +{extra}
        </span>
      )}
    </div>
  )
}

/* ---------------------------------------------------------------- Progress */
export function Progress({ value = 0, tone = 'violet', size = 'md', showLabel = false, className = '' }) {
  const heights = { xs: 'h-1', sm: 'h-1.5', md: 'h-2.5', lg: 'h-3.5' }
  const toneHex = accent(tone).hex
  const safe = Math.max(0, Math.min(100, value || 0))
  return (
    <div className={`flex items-center gap-2.5 ${className}`}>
      <div
        className={`relative w-full overflow-hidden rounded-full bg-white/[0.07] ${heights[size] || heights.md}`}
        role="progressbar"
        aria-valuenow={Math.round(safe)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${safe}%` }}
          transition={{ type: 'spring', stiffness: 140, damping: 22 }}
          className="h-full rounded-full"
          style={{
            background: `linear-gradient(90deg, ${toneHex}, ${toneHex}dd)`,
            boxShadow: `0 0 14px -2px ${accent(tone).glow}`,
          }}
        />
        {safe > 0 && safe < 100 && (
          <div
            className="absolute inset-y-0 w-16 animate-shimmer opacity-40"
            style={{
              backgroundImage:
                'linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)',
              backgroundSize: '200% 100%',
            }}
          />
        )}
      </div>
      {showLabel && (
        <span className="min-w-[46px] shrink-0 text-right text-[11.5px] font-semibold text-2">
          {percentLabel(safe)}%
        </span>
      )}
    </div>
  )
}

/** Circular progress with the number in the middle. */
export function RadialProgress({ value = 0, size = 120, stroke = 10, tone = 'violet', label, sublabel, children }) {
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  const safe = Math.max(0, Math.min(100, value || 0))
  return (
    <div className="relative inline-grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke="rgb(var(--surface-3))" strokeWidth={stroke}
        />
        <motion.circle
          cx={size / 2} cy={size / 2} r={radius} fill="none"
          stroke={accent(tone).hex} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - (safe / 100) * circumference }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 6px ${accent(tone).glow})` }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        {children ?? (
          <div>
            <div className="text-2xl font-bold tabular">{Math.round(safe)}%</div>
            {label && <div className="text-[10.5px] uppercase tracking-wider text-3">{label}</div>}
          </div>
        )}
      </div>
      {sublabel && <div className="absolute -bottom-1 text-[11px] text-3">{sublabel}</div>}
    </div>
  )
}

/* ------------------------------------------------------------------- Field */
export function Field({ label, hint, error, required, children, className = '', htmlFor }) {
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={htmlFor}>
          {label}
          {required && <span className="ml-1 text-rose-400">*</span>}
        </label>
      )}
      {children}
      {error ? (
        <p className="mt-1.5 text-[12px] font-medium text-rose-300">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[12px] text-3">{hint}</p>
      ) : null}
    </div>
  )
}

export const Input = forwardRef(function Input({ className = '', invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className={`input ${invalid ? 'border-rose-400/60 focus:border-rose-400 focus:shadow-[0_0_0_4px_rgba(244,63,94,0.16)]' : ''} ${className}`}
      {...rest}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ className = '', rows = 4, invalid, ...rest }, ref) {
  return (
    <textarea
      ref={ref}
      rows={rows}
      className={`input resize-y leading-relaxed ${invalid ? 'border-rose-400/60' : ''} ${className}`}
      {...rest}
    />
  )
})

export const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return (
    <div className="relative">
      <select
        ref={ref}
        className={`input cursor-pointer appearance-none pr-9 ${className}`}
        {...rest}
      >
        {children}
      </select>
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-3">▾</span>
    </div>
  )
})

/* ------------------------------------------------------------------ Switch */
export function Switch({ checked, onChange, label, hint, disabled, id }) {
  const autoId = useId()
  const inputId = id || autoId
  return (
    <label htmlFor={inputId} className="flex cursor-pointer items-start gap-3">
      <button
        id={inputId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange?.(!checked)}
        className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-all duration-300 ${
          checked ? 'bg-brand-gradient' : 'bg-white/10'
        } ${disabled ? 'opacity-50' : ''}`}
      >
        <motion.span
          layout
          transition={{ type: 'spring', stiffness: 520, damping: 32 }}
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-md"
          style={{ left: checked ? 22 : 2 }}
        />
      </button>
      {(label || hint) && (
        <span className="min-w-0">
          {label && <span className="block text-[13.5px] font-medium">{label}</span>}
          {hint && <span className="mt-0.5 block text-[12px] leading-snug text-3">{hint}</span>}
        </span>
      )}
    </label>
  )
}

/* -------------------------------------------------------------------- Tabs */
export function Tabs({ tabs, value, onChange, className = '' }) {
  return (
    <div className={`no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-[rgb(var(--surface-1))] p-1 ring-1 ring-white/5 ${className}`}>
      {tabs.map((tab) => {
        const active = tab.id === value
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={`relative shrink-0 rounded-lg px-3.5 py-2 text-[13px] font-semibold transition-colors ${
              active ? 'text-white' : 'text-3 hover:text-2'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`tab-${tabs.map((t) => t.id).join('')}`}
                className="absolute inset-0 rounded-lg bg-brand-gradient shadow-[0_6px_18px_-8px_rgba(116,80,245,0.9)]"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {tab.icon && <span>{tab.icon}</span>}
              {tab.label}
              {tab.count !== undefined && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] tabular ${active ? 'bg-white/20' : 'bg-white/[0.06]'}`}>
                  {tab.count}
                </span>
              )}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Pill filter row (community categories, status filters…). */
export function PillGroup({ items, value, onChange, className = '' }) {
  return (
    <div className={`no-scrollbar flex gap-2 overflow-x-auto pb-1 ${className}`}>
      {items.map((item) => {
        const active = item.id === value
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onChange(item.id)}
            className={`relative shrink-0 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition-all ${
              active
                ? 'text-white shadow-[0_8px_22px_-12px_rgba(116,80,245,0.9)]'
                : 'bg-[rgb(var(--surface-1))] text-3 ring-1 ring-white/5 hover:text-2 hover:bg-[rgb(var(--surface-2))]'
            }`}
          >
            {active && (
              <motion.span
                layoutId={`pill-${items.map((i) => i.id).join('')}`}
                className="absolute inset-0 rounded-full bg-brand-gradient"
                transition={{ type: 'spring', stiffness: 420, damping: 34 }}
              />
            )}
            <span className="relative flex items-center gap-1.5">
              {item.icon && <span>{item.icon}</span>}
              {item.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------------- Modal */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }) {
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => event.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = previous
    }
  }, [open, onClose])

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' }

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center p-0 sm:items-center sm:p-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-black/70 backdrop-blur-md"
          />
          <motion.div
            ref={ref}
            initial={{ opacity: 0, y: 30, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.98 }}
            transition={{ type: 'spring', stiffness: 380, damping: 32 }}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className={`card relative z-10 max-h-[92vh] w-full overflow-y-auto rounded-b-none sm:rounded-2xl ${widths[size]}`}
          >
            {(title || subtitle) && (
              <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-white/5 bg-[rgb(var(--page))]/85 px-6 py-4 backdrop-blur-xl">
                <div className="min-w-0">
                  <h2 className="text-[17px] font-semibold tracking-tight">{title}</h2>
                  {subtitle && <p className="mt-0.5 text-[12.5px] text-3">{subtitle}</p>}
                </div>
                <Button variant="quiet" size="icon-sm" onClick={onClose} aria-label="Close dialog">
                  ✕
                </Button>
              </div>
            )}
            <div className="px-6 py-5">{children}</div>
            {footer && (
              <div className="sticky bottom-0 flex items-center justify-end gap-2.5 border-t border-white/5 bg-[rgb(var(--page))]/85 px-6 py-4 backdrop-blur-xl">
                {footer}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** Destructive-action confirmation. */
export function ConfirmDialog({ open, onClose, onConfirm, title, message, confirmLabel = 'Delete', loading }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={loading}>
            Cancel
          </Button>
          <Button variant="danger" onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <p className="text-[13.5px] leading-relaxed text-2">{message}</p>
    </Modal>
  )
}

/* ------------------------------------------------------------ Empty/Loading */
export function EmptyState({ icon = '🌱', title, message, action, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center px-6 py-14 text-center ${className}`}>
      <div className="relative mb-5">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-500/25 blur-xl" />
        <span className="relative grid h-16 w-16 place-items-center rounded-2xl bg-brand-gradient-soft text-[26px] ring-1 ring-white/10">
          {icon}
        </span>
      </div>
      <h3 className="text-[16px] font-semibold tracking-tight">{title}</h3>
      {message && <p className="mt-1.5 max-w-sm text-[13.5px] leading-relaxed text-3">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

export function Skeleton({ className = '' }) {
  return <div className={`skeleton ${className}`} />
}

export function LoadingScreen({ label = 'Loading' }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4">
      <div className="relative">
        <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-500/40 blur-2xl" />
        <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient shadow-glow">
          <Spinner size={22} className="text-white" />
        </span>
      </div>
      <p className="text-[13px] font-medium tracking-wide text-3">{label}…</p>
    </div>
  )
}

/* ------------------------------------------------------------------- Misc */
export function StatDelta({ value, suffix = '', invert = false }) {
  if (value === undefined || value === null) return null
  const positive = invert ? value < 0 : value > 0
  const neutral = value === 0
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[11.5px] font-semibold ${
        neutral ? 'text-3' : positive ? 'text-emerald-300' : 'text-rose-300'
      }`}
    >
      {!neutral && <span>{positive ? '▲' : '▼'}</span>}
      {Math.abs(value)}
      {suffix}
    </span>
  )
}

export function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex rounded-xl bg-[rgb(var(--surface-1))] p-1 ring-1 ring-white/5 ${className}`}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          className={`relative rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
            option.id === value ? 'text-white' : 'text-3 hover:text-2'
          }`}
        >
          {option.id === value && (
            <motion.span
              layoutId={`seg-${options.map((o) => o.id).join('')}`}
              className="absolute inset-0 rounded-lg bg-brand-gradient"
              transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            />
          )}
          <span className="relative flex items-center gap-1.5">
            {option.icon && <span>{option.icon}</span>}
            {option.label}
          </span>
        </button>
      ))}
    </div>
  )
}

export function Tooltip({ content, children, side = 'top' }) {
  const positions = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  }
  return (
    <span className="group/tt relative inline-flex">
      {children}
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg bg-ink-700 px-2.5 py-1.5 text-[11.5px] font-medium text-white shadow-lift ring-1 ring-white/10 group-hover/tt:block group-hover/tt:animate-fade-up ${positions[side]}`}
      >
        {content}
      </span>
    </span>
  )
}

export function Divider({ label, className = '' }) {
  if (!label) return <div className={`divider ${className}`} />
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="divider flex-1" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-3">{label}</span>
      <div className="divider flex-1" />
    </div>
  )
}

/** Accessible collapsible section used for "show more" content. */
export function Collapse({ open, children, className = '' }) {
  return (
    <AnimatePresence initial={false}>
      {open && (
        <motion.div
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className={`overflow-hidden ${className}`}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/** Small hook: copy-to-clipboard with transient confirmation. */
export function useCopy() {
  const [copied, setCopied] = useState(false)
  const copy = async (text) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    } catch {
      /* clipboard blocked - not fatal */
    }
  }
  return { copied, copy }
}
