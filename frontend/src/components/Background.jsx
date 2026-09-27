import { motion } from 'framer-motion'

/**
 * Ambient background: an animated aurora behind a masked grid, plus a soft
 * vignette. Purely decorative and `pointer-events-none`, and it hides itself on
 * small screens / for users who ask for reduced motion.
 */
export function Background({ variant = 'app' }) {
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
      {/* base wash */}
      <div className="absolute inset-0 bg-[rgb(var(--page))]" />

      {variant === 'marketing' ? (
        <>
          <div className="absolute -left-[18%] -top-[22%] h-[62vw] w-[62vw] animate-aurora rounded-full bg-brand-600/25 blur-[130px]" />
          <div className="absolute -right-[14%] top-[8%] h-[52vw] w-[52vw] animate-aurora rounded-full bg-cyan-500/18 blur-[130px]" style={{ animationDelay: '-9s' }} />
          <div className="absolute bottom-[-24%] left-[24%] h-[54vw] w-[54vw] animate-aurora rounded-full bg-fuchsia-500/16 blur-[140px]" style={{ animationDelay: '-17s' }} />
          <div className="absolute inset-0 grid-bg opacity-60 mask-fade-b" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand-400/50 to-transparent" />
        </>
      ) : (
        <>
          <div className="absolute -left-[14%] -top-[18%] h-[46vw] w-[46vw] animate-aurora rounded-full bg-brand-600/16 blur-[120px]" />
          <div className="absolute -right-[10%] top-[24%] h-[38vw] w-[38vw] animate-aurora rounded-full bg-cyan-500/10 blur-[120px]" style={{ animationDelay: '-11s' }} />
          <div className="absolute inset-0 grid-bg opacity-40 mask-fade-b" />
        </>
      )}

      {/* fine noise for depth */}
      <div
        className="absolute inset-0 opacity-[0.028] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />
      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_0%,transparent_35%,rgb(0_0_0/0.35)_100%)]" />
    </div>
  )
}

/** Page-level entrance wrapper. Every route uses it, so transitions feel uniform. */
export function Page({ children, className = '' }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

/** Staggered list container: children animate in sequence. */
export function Stagger({ children, className = '', delay = 0 }) {
  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{
        hidden: {},
        visible: { transition: { staggerChildren: 0.055, delayChildren: delay } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}

export function StaggerItem({ children, className = '' }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 16, scale: 0.985 },
        visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
      }}
      className={className}
    >
      {children}
    </motion.div>
  )
}
