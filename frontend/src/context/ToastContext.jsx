import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'

const ToastContext = createContext(null)

const TONE = {
  success: {
    ring: 'ring-emerald-400/30',
    glow: 'shadow-[0_20px_60px_-30px_rgba(16,185,129,0.8)]',
    icon: '✓',
    tint: 'text-emerald-300',
    bar: 'bg-emerald-400',
  },
  error: {
    ring: 'ring-rose-400/30',
    glow: 'shadow-[0_20px_60px_-30px_rgba(244,63,94,0.8)]',
    icon: '!',
    tint: 'text-rose-300',
    bar: 'bg-rose-400',
  },
  info: {
    ring: 'ring-brand-400/30',
    glow: 'shadow-[0_20px_60px_-30px_rgba(116,80,245,0.8)]',
    icon: 'i',
    tint: 'text-brand-300',
    bar: 'bg-brand-400',
  },
  celebrate: {
    ring: 'ring-amber-300/40',
    glow: 'shadow-[0_20px_70px_-25px_rgba(251,191,36,0.85)]',
    icon: '★',
    tint: 'text-amber-300',
    bar: 'bg-gradient-to-r from-amber-300 via-rose-300 to-violet-400',
  },
}

/**
 * Toast provider - one place for every "it worked / it failed" signal in the app.
 * The `celebrate` tone exists for milestone + badge moments, which is where a
 * generic grey toast would undersell the achievement.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const timers = useRef(new Map())

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id))
    const timer = timers.current.get(id)
    if (timer) {
      clearTimeout(timer)
      timers.current.delete(id)
    }
  }, [])

  const push = useCallback(
    (message, { tone = 'info', title, duration = 4200, action } = {}) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      setToasts((current) => [...current.slice(-3), { id, message, tone, title, action }])
      if (duration) {
        timers.current.set(id, setTimeout(() => dismiss(id), duration))
      }
      return id
    },
    [dismiss],
  )

  const value = useMemo(
    () => ({
      push,
      dismiss,
      success: (message, options) => push(message, { ...options, tone: 'success' }),
      error: (message, options) => push(message, { ...options, tone: 'error', duration: 6000 }),
      info: (message, options) => push(message, { ...options, tone: 'info' }),
      celebrate: (message, options) => push(message, { ...options, tone: 'celebrate', duration: 6000 }),
    }),
    [push, dismiss],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 p-4 sm:items-end sm:p-6">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => {
            const tone = TONE[toast.tone] || TONE.info
            return (
              <motion.div
                key={toast.id}
                layout
                initial={{ opacity: 0, y: 24, scale: 0.94 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 10, scale: 0.96 }}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                className={`card pointer-events-auto relative w-full max-w-sm overflow-hidden p-3.5 pr-10 ring-1 ${tone.ring} ${tone.glow}`}
                role="status"
              >
                <div className={`absolute inset-x-0 top-0 h-0.5 ${tone.bar}`} />
                <div className="flex items-start gap-3">
                  <span
                    className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/[0.06] text-[11px] font-bold ${tone.tint}`}
                  >
                    {tone.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    {toast.title && <p className="text-[13px] font-semibold">{toast.title}</p>}
                    <p className="text-[13px] leading-snug text-2 whitespace-pre-line">
                      {toast.message}
                    </p>
                    {toast.action && (
                      <button
                        type="button"
                        onClick={() => {
                          toast.action.onClick()
                          dismiss(toast.id)
                        }}
                        className="mt-1.5 text-[12px] font-semibold text-brand-300 hover:text-brand-200"
                      >
                        {toast.action.label}
                      </button>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => dismiss(toast.id)}
                  aria-label="Dismiss notification"
                  className="absolute right-2.5 top-2.5 grid h-6 w-6 place-items-center rounded-lg text-3 transition hover:bg-white/10 hover:text-1"
                >
                  ✕
                </button>
              </motion.div>
            )
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside <ToastProvider>')
  return context
}
