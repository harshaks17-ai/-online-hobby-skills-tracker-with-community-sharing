import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useAuth } from '../../context/AuthContext'
import { useToast } from '../../context/ToastContext'
import { useTheme } from '../../context/ThemeContext'
import { platformApi, skillsApi } from '../../lib/api'
import { useAsync, useDismiss } from '../../lib/hooks'
import { humanMinutes } from '../../lib/format'
import { Avatar, Button, Progress, Spinner, Tooltip } from '../ui'

const NAV = [
  {
    section: 'Practice',
    items: [
      { to: '/app', label: 'Dashboard', icon: 'grid', end: true },
      { to: '/app/skills', label: 'My skills', icon: 'target' },
      { to: '/app/practice', label: 'Log practice', icon: 'plus' },
      { to: '/app/goals', label: 'Goals', icon: 'flag' },
    ],
  },
  {
    section: 'Community',
    items: [
      { to: '/app/feed', label: 'Feed', icon: 'sparkles' },
      { to: '/app/discover', label: 'Discover', icon: 'compass' },
      { to: '/app/leaderboard', label: 'Leaderboard', icon: 'trophy' },
    ],
  },
  {
    section: 'Platform',
    items: [
      { to: '/app/analytics', label: 'Analytics', icon: 'chart' },
      { to: '/app/cloud', label: 'Cloud console', icon: 'cloud' },
      { to: '/app/settings', label: 'Settings', icon: 'settings' },
    ],
  },
]

const ICONS = {
  grid: 'M4 4h7v7H4V4Zm9 0h7v7h-7V4ZM4 13h7v7H4v-7Zm9 0h7v7h-7v-7Z',
  target: 'M12 3v3m0 12v3m9-9h-3M6 12H3m13.5-6.5-2.1 2.1M9.6 14.4l-2.1 2.1m9 0-2.1-2.1M9.6 9.6 7.5 7.5M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z',
  plus: 'M12 5v14M5 12h14',
  flag: 'M5 21V4m0 0h11l-2 4 2 4H5',
  sparkles: 'M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5 18 18M18 6l-2.5 2.5M8.5 15.5 6 18',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3.5-12.5-2 5-5 2 2-5 5-2Z',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0V4Zm0 2H5v2a3 3 0 0 0 3 3m8-5h3v2a3 3 0 0 1-3 3M9 20h6m-3-7v7',
  chart: 'M4 20V10m5 10V4m5 16v-7m5 7V8',
  cloud: 'M7 18a4 4 0 1 1 .5-7.97A5.5 5.5 0 0 1 18 9.5 3.5 3.5 0 0 1 17.5 18H7Z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.13-1.42l2-1.55-2-3.46-2.36.95a8 8 0 0 0-2.45-1.42L14.7 2h-4l-.36 2.6a8 8 0 0 0-2.45 1.42l-2.36-.95-2 3.46 2 1.55a8.2 8.2 0 0 0 0 2.84l-2 1.55 2 3.46 2.36-.95a8 8 0 0 0 2.45 1.42L10.7 22h4l.36-2.6a8 8 0 0 0 2.45-1.42l2.36.95 2-3.46-2-1.55c.08-.46.13-.93.13-1.42Z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  bell: 'M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6ZM10.5 20a2 2 0 0 0 3 0',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  logout: 'M15 17l5-5-5-5m5 5H9M12 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6',
  sun: 'M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.42-1.42M4.92 19.08l1.42-1.42m0-11.32L4.92 4.92m14.16 14.16-1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z',
  close: 'M6 6l12 12M18 6 6 18',
}

function Icon({ name, className = 'h-[18px] w-[18px]' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <path
        d={ICONS[name] || ICONS.grid}
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function Brand({ compact = false, to = '/app' }) {
  return (
    <Link to={to} className="group flex items-center gap-2.5">
      <span className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-gradient shadow-[0_10px_26px_-12px_rgba(116,80,245,0.9)]">
        <svg viewBox="0 0 64 64" className="h-5 w-5">
          <path d="M18 42V22l14 12V22l14 12V22" fill="none" stroke="#fff" strokeWidth="6"
            strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/25" />
      </span>
      {!compact && (
        <span className="min-w-0">
          <span className="block font-display text-[16px] font-bold leading-none tracking-tight">
            Hobby<span className="text-gradient">Log</span>
          </span>
          <span className="mt-0.5 block text-[10.5px] font-medium uppercase tracking-[0.16em] text-3">
            Cloud
          </span>
        </span>
      )}
    </Link>
  )
}

/* ------------------------------------------------------------------ Sidebar */
function SidebarContent({ onNavigate }) {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()

  return (
    <div className="flex h-full flex-col">
      <div className="px-5 pb-5 pt-6">
        <Brand />
      </div>

      <nav className="no-scrollbar flex-1 space-y-6 overflow-y-auto px-3 pb-4">
        {NAV.map((group) => (
          <div key={group.section}>
            <p className="mb-2 px-3 text-[10px] font-bold uppercase tracking-[0.18em] text-3">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    end={item.end}
                    onClick={onNavigate}
                    className={({ isActive }) =>
                      `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13.5px] font-medium transition-all duration-200 ${
                        isActive ? 'text-white' : 'text-3 hover:bg-[rgb(var(--surface-1))] hover:text-1'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="nav-active"
                            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                            className="absolute inset-0 rounded-xl bg-brand-gradient-soft ring-1 ring-brand-400/25"
                          />
                        )}
                        {isActive && (
                          <motion.span
                            layoutId="nav-marker"
                            transition={{ type: 'spring', stiffness: 400, damping: 34 }}
                            className="absolute -left-3 h-6 w-1 rounded-r-full bg-brand-gradient"
                          />
                        )}
                        <Icon name={item.icon} className="relative h-[18px] w-[18px] shrink-0" />
                        <span className="relative truncate">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      <div className="border-t border-white/5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <Link
            to={`/u/${user?.username}`}
            onClick={onNavigate}
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-2 py-2 transition hover:bg-[rgb(var(--surface-1))]"
          >
            <Avatar user={user} size={34} />
            <span className="min-w-0 text-left">
              <span className="block truncate text-[13px] font-semibold leading-tight">{user?.name}</span>
              <span className="block truncate text-[11.5px] text-3">@{user?.username}</span>
            </span>
          </Link>
          <Tooltip content="Sign out">
            <Button
              variant="quiet"
              size="icon-sm"
              aria-label="Sign out"
              onClick={async () => {
                await signOut()
                navigate('/login')
              }}
            >
              <Icon name="logout" className="h-4 w-4" />
            </Button>
          </Tooltip>
        </div>
        <button
          type="button"
          onClick={toggle}
          className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-[12.5px] font-medium text-3 transition hover:bg-[rgb(var(--surface-1))] hover:text-1"
        >
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} className="h-4 w-4" />
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------- Topbar */
function CommandPalette({ open, onClose }) {
  const [query, setQuery] = useState('')
  const [skills, setSkills] = useState([])
  const inputRef = useRef(null)
  const navigate = useNavigate()
  const boxRef = useRef(null)
  useDismiss(boxRef, onClose, open)

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 40)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    skillsApi.list().then((data) => setSkills(data.items || [])).catch(() => setSkills([]))
  }, [open])

  const actions = useMemo(
    () => [
      { label: 'Go to dashboard', to: '/app', icon: 'grid', group: 'Navigate' },
      { label: 'Log a practice session', to: '/app/practice?new=1', icon: 'plus', group: 'Actions' },
      { label: 'Create a new skill', to: '/app/skills?new=1', icon: 'target', group: 'Actions' },
      { label: 'Set a goal', to: '/app/goals?new=1', icon: 'flag', group: 'Actions' },
      { label: 'Open the community feed', to: '/app/feed', icon: 'sparkles', group: 'Navigate' },
      { label: 'Discover skills', to: '/app/discover', icon: 'compass', group: 'Navigate' },
      { label: 'View analytics', to: '/app/analytics', icon: 'chart', group: 'Navigate' },
      { label: 'Cloud console', to: '/app/cloud', icon: 'cloud', group: 'Platform' },
      { label: 'Settings', to: '/app/settings', icon: 'settings', group: 'Platform' },
    ],
    [],
  )

  const filteredActions = actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
  const filteredSkills = skills
    .filter((s) => s.title.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5)

  const go = (to) => {
    onClose()
    navigate(to)
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[85] flex items-start justify-center px-4 pt-[12vh]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-md" onClick={onClose} />
      <motion.div
        ref={boxRef}
        initial={{ opacity: 0, y: -16, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: 'spring', stiffness: 380, damping: 30 }}
        className="card relative z-10 w-full max-w-xl overflow-hidden p-0"
      >
        <div className="flex items-center gap-3 border-b border-white/5 px-4 py-3.5">
          <Icon name="search" className="h-4 w-4 shrink-0 text-3" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search skills or jump to a page…"
            className="flex-1 bg-transparent text-[14px] outline-none placeholder:text-3"
          />
          <kbd className="rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold text-3">ESC</kbd>
        </div>
        <div className="max-h-[52vh] overflow-y-auto p-2">
          {filteredActions.length > 0 && (
            <>
              <p className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-3">
                {query ? 'Matching actions' : 'Actions'}
              </p>
              {filteredActions.map((action) => (
                <button
                  key={action.to}
                  type="button"
                  onClick={() => go(action.to)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition hover:bg-[rgb(var(--surface-2))]"
                >
                  <Icon name={action.icon} className="h-4 w-4 shrink-0 text-3" />
                  <span className="flex-1 truncate">{action.label}</span>
                  <span className="text-[11px] text-3">{action.group}</span>
                </button>
              ))}
            </>
          )}
          {filteredSkills.length > 0 && (
            <>
              <p className="mt-2 px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.16em] text-3">
                My skills
              </p>
              {filteredSkills.map((skill) => (
                <button
                  key={skill.id}
                  type="button"
                  onClick={() => go(`/app/skills/${skill.id}`)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13.5px] transition hover:bg-[rgb(var(--surface-2))]"
                >
                  <span className="text-base">{skill.icon}</span>
                  <span className="flex-1 truncate">{skill.title}</span>
                  <span className="text-[11px] text-3">{humanMinutes(skill.total_minutes)}</span>
                </button>
              ))}
            </>
          )}
          {filteredActions.length === 0 && filteredSkills.length === 0 && (
            <p className="px-3 py-8 text-center text-[13px] text-3">Nothing matches “{query}”.</p>
          )}
        </div>
      </motion.div>
    </div>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useDismiss(ref, () => setOpen(false), open)
  const { data } = useAsync(() => platformApi.notifications(), [open])
  const toast = useToast()
  const unread = (data?.items || []).filter((n) => !n.read).length

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-xl text-3 transition hover:bg-[rgb(var(--surface-2))] hover:text-1"
      >
        <Icon name="bell" className="h-[18px] w-[18px]" />
        {unread > 0 && (
          <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-rose-500 px-1 text-[9.5px] font-bold text-white ring-2 ring-[rgb(var(--page))]">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ duration: 0.18 }}
            className="card absolute right-0 top-11 z-50 w-80 overflow-hidden p-0"
          >
            <div className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <span className="text-[13px] font-semibold">Notifications</span>
              {(data?.unread ?? 0) > 0 && (
                <button
                  type="button"
                  onClick={async () => {
                    await platformApi.markNotificationsRead()
                    toast.success('All caught up.')
                    setOpen(false)
                  }}
                  className="text-[11.5px] font-semibold text-brand-300 hover:text-brand-200"
                >
                  Mark all read
                </button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {(data?.items || []).length === 0 ? (
                <p className="px-4 py-8 text-center text-[12.5px] text-3">
                  No activity yet. Like and comment to get things started.
                </p>
              ) : (
                (data?.items || []).map((item) => (
                  <div
                    key={item.id}
                    className={`flex gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0 ${
                      item.read ? 'opacity-60' : ''
                    }`}
                  >
                    <Avatar user={item.actor} size={30} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[12.5px] leading-snug">{item.message}</p>
                      <p className="mt-0.5 text-[11px] text-3">
                        {new Date(item.created_at).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {!item.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand-400" />}
                  </div>
                ))
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function Topbar({ onOpenSidebar }) {
  const { user, stats } = useAuth()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const location = useLocation()
  const navigate = useNavigate()
  useAsync(() => skillsApi.list({ status: 'ACTIVE' }), [location.pathname])

  useEffect(() => {
    const onKey = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setPaletteOpen(true)
      }
      if (event.key === '/' && !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const weeklyTarget = stats?.weekly_target_minutes || 0
  const weeklyMinutes = stats?.weekly_minutes?.[currentWeekKey()] || 0
  const weeklyPct = weeklyTarget ? Math.min(100, (weeklyMinutes / weeklyTarget) * 100) : 0

  return (
    <>
      <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-white/5 bg-[rgb(var(--page))]/80 px-4 backdrop-blur-xl sm:px-6">
        <Button variant="quiet" size="icon" className="lg:hidden" onClick={onOpenSidebar} aria-label="Open navigation">
          <Icon name="menu" />
        </Button>
        <div className="lg:hidden">
          <Brand compact />
        </div>

        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="ml-auto hidden min-w-0 flex-1 items-center gap-2.5 rounded-xl border border-white/5 bg-[rgb(var(--surface-1))] px-3.5 py-2 text-left text-[13px] text-3 transition hover:border-white/10 hover:text-2 sm:flex lg:ml-0 lg:max-w-md"
        >
          <Icon name="search" className="h-4 w-4 shrink-0" />
          <span className="flex-1 truncate">Search or jump to…</span>
          <kbd className="hidden rounded-md bg-white/[0.07] px-1.5 py-0.5 text-[10px] font-semibold sm:block">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex items-center gap-2 sm:gap-3">
          {weeklyTarget > 0 && (
            <div className="hidden items-center gap-2.5 rounded-xl bg-[rgb(var(--surface-1))] px-3 py-1.5 md:flex">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-3">Week</span>
              <div className="w-20">
                <Progress value={weeklyPct} size="xs" tone="violet" />
              </div>
              <span className="tabular text-[12px] font-semibold text-2">
                {humanMinutes(weeklyMinutes)} / {humanMinutes(weeklyTarget)}
              </span>
            </div>
          )}

          <Button
            variant="primary"
            size="sm"
            className="hidden sm:inline-flex"
            onClick={() => navigate('/app/practice?new=1')}
          >
            <span className="text-base leading-none">+</span> Log practice
          </Button>

          <NotificationBell />
          <Link
            to={`/u/${user?.username}`}
            className="rounded-full transition hover:opacity-85"
            aria-label="View your profile"
          >
            <Avatar user={user} size={34} />
          </Link>
        </div>
      </header>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </>
  )
}

function currentWeekKey() {
  const now = new Date()
  const target = new Date(now.valueOf())
  const dayNr = (now.getDay() + 6) % 7
  target.setDate(target.getDate() - dayNr + 3)
  const firstThursday = target.valueOf()
  target.setMonth(0, 1)
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7))
  }
  const week = 1 + Math.ceil((firstThursday - target) / 604800000)
  return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`
}

/* --------------------------------------------------------------- AppShell */
export function AppShell({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const { booting } = useAuth()
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname])

  if (booting) {
    return (
      <div className="grid min-h-screen place-items-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <span className="absolute inset-0 animate-pulse-ring rounded-full bg-brand-500/40 blur-2xl" />
            <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-brand-gradient shadow-glow">
              <Spinner size={22} className="text-white" />
            </span>
          </div>
          <p className="text-[13px] font-medium tracking-wide text-3">Restoring your session…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] border-r border-white/5 bg-[rgb(var(--page))]/60 backdrop-blur-xl lg:block">
        <SidebarContent />
      </aside>

      {/* mobile drawer */}
      <AnimatePresence>
        {sidebarOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSidebarOpen(false)}
              className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm lg:hidden"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              className="fixed inset-y-0 left-0 z-[60] w-[268px] border-r border-white/5 bg-[rgb(var(--page))] lg:hidden"
            >
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="absolute right-3 top-5 z-10 grid h-8 w-8 place-items-center rounded-lg text-3 hover:bg-white/10 hover:text-1"
                aria-label="Close navigation"
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
              <SidebarContent onNavigate={() => setSidebarOpen(false)} />
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="lg:pl-[248px]">
        <Topbar onOpenSidebar={() => setSidebarOpen(true)} />
        <main className="mx-auto w-full max-w-[1400px] px-4 pb-20 pt-6 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    </div>
  )
}

export { Icon }
