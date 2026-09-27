import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { communityApi } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { compactNumber, humanMinutes } from '../lib/format'
import { accent } from '../lib/constants'
import { Stagger, StaggerItem } from '../components/Background'
import { Brand } from '../components/layout/AppShell'
import { Avatar, Badge, Button, Card } from '../components/ui'

const FEATURES = [
  {
    icon: '⏱️',
    title: 'Log in one tap',
    body: 'Record minutes, what you worked on and how it felt. Everything downstream — streaks, goals, charts — updates from that single write.',
    accent: 'violet',
  },
  {
    icon: '🔥',
    title: 'Streaks that mean something',
    body: 'Streaks count distinct practice days, not log spam. Three sessions in one day is still a streak of one.',
    accent: 'amber',
  },
  {
    icon: '🎯',
    title: 'Goals with real milestones',
    body: 'Set a target in hours, sessions, pieces or pages. We auto-generate 25/50/75/100% milestones and light each one up as you pass it.',
    accent: 'emerald',
  },
  {
    icon: '📊',
    title: 'Analytics worth opening',
    body: 'Weekly trend, per-skill split, a 26-week consistency heatmap, and a “when do you actually practise” histogram.',
    accent: 'sky',
  },
  {
    icon: '☁️',
    title: 'Cloud object storage',
    body: 'Upload proof of work — photos, scans, recordings. Metadata lives in the database, bytes live in the bucket behind a signed URL.',
    accent: 'cyan',
  },
  {
    icon: '💬',
    title: 'Share with the community',
    body: 'Post an update, attach a skill, get likes and comments. Follow people to build a following-only feed.',
    accent: 'pink',
  },
]

const CLOUD_LAYERS = [
  { label: 'CDN + Static hosting', tech: 'SPA assets, edge cached', tone: 'violet' },
  { label: 'Identity', tech: 'JWT / Firebase Auth', tone: 'rose' },
  { label: 'REST API', tech: 'FastAPI, stateless replicas', tone: 'sky' },
  { label: 'Cloud database', tech: 'PostgreSQL / Firestore', tone: 'emerald' },
  { label: 'Object storage', tech: 'S3 / Cloud Storage + signed URLs', tone: 'cyan' },
  { label: 'Serverless jobs', tech: 'Triggers, streaks, badges', tone: 'amber' },
]

const STEPS = [
  { n: '01', title: 'Create your account', body: 'Email + password, hashed and salted. You are in within 30 seconds.' },
  { n: '02', title: 'Add a skill', body: 'Pick a category, set a weekly target and how long a typical session is.' },
  { n: '03', title: 'Log practice', body: 'Minutes, activity, notes, optional photo. The streak starts immediately.' },
  { n: '04', title: 'Share the win', body: 'Post to the feed, attach a milestone, invite some encouragement.' },
]

export default function Landing() {
  const { data: stats } = useAsync(() => communityApi.stats(), [])
  const { data: trending } = useAsync(() => communityApi.trending(), [])
  const { data: leaderboard } = useAsync(() => communityApi.leaderboard({ limit: 5 }), [])
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen">
      {/* ---------------------------------------------------------------- nav */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled ? 'border-b border-white/5 bg-[rgb(var(--page))]/80 backdrop-blur-xl' : ''
        }`}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 sm:px-6 lg:px-8">
          <Brand to="/" />
          <nav className="ml-6 hidden items-center gap-1 md:flex">
            {[
              ['#features', 'Features'],
              ['#how', 'How it works'],
              ['#cloud', 'Architecture'],
              ['#community', 'Community'],
            ].map(([href, label]) => (
              <a
                key={href}
                href={href}
                className="rounded-lg px-3 py-2 text-[13.5px] font-medium text-3 transition hover:text-1"
              >
                {label}
              </a>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-2.5">
            <Link to="/login">
              <Button variant="quiet">Sign in</Button>
            </Link>
            <Link to="/register">
              <Button variant="primary">Get started</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* --------------------------------------------------------------- hero */}
      <section className="relative overflow-hidden px-4 pb-20 pt-32 sm:px-6 lg:px-8 lg:pt-40">
        <div className="mx-auto grid max-w-7xl items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
          <Stagger>
            <StaggerItem>
              <span className="chip mb-6 gap-2 text-[12px]">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" />
                </span>
                Built for a cloud computing course · runs locally, deploys to the cloud
              </span>
            </StaggerItem>

            <StaggerItem>
              <h1 className="font-display text-[clamp(2.6rem,7vw,4.6rem)] font-bold leading-[0.98] tracking-[-0.035em]">
                Track every skill.
                <br />
                <span className="text-gradient">Share every win.</span>
              </h1>
            </StaggerItem>

            <StaggerItem>
              <p className="mt-6 max-w-xl text-[16.5px] leading-relaxed text-2">
                Most people quit hobbies because nobody noticed. HobbyLog gives you a place to
                log practice, a streak you do not want to break, goals that actually move — and a
                community that cheers when you hit a milestone.
              </p>
            </StaggerItem>

            <StaggerItem>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <Link to="/register">
                  <Button variant="primary" size="lg">
                    Start tracking free
                    <span aria-hidden="true">→</span>
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="ghost" size="lg">
                    Try the demo account
                  </Button>
                </Link>
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-[12.5px] text-3">
                <span className="flex items-center gap-1.5">✓ No credit card</span>
                <span className="flex items-center gap-1.5">✓ Works on any device</span>
                <span className="flex items-center gap-1.5">✓ Your data stays yours</span>
              </div>
            </StaggerItem>

            <StaggerItem>
              <div className="mt-12 grid max-w-xl grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: 'Tracked skills', value: stats?.skills },
                  { label: 'Practice hours', value: stats ? Math.round(stats.practice_hours) : null },
                  { label: 'Sessions logged', value: stats?.sessions },
                  { label: 'Community posts', value: stats?.posts },
                ].map((item) => (
                  <div key={item.label} className="card px-3.5 py-3">
                    <div className="text-xl font-bold tabular">
                      {item.value === null || item.value === undefined ? '—' : compactNumber(item.value)}
                    </div>
                    <div className="mt-0.5 text-[11px] leading-tight text-3">{item.label}</div>
                  </div>
                ))}
              </div>
            </StaggerItem>
          </Stagger>

          {/* live product preview */}
          <motion.div
            initial={{ opacity: 0, y: 40, rotateY: -8 }}
            animate={{ opacity: 1, y: 0, rotateY: 0 }}
            transition={{ duration: 0.9, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="relative"
          >
            <div className="absolute -inset-6 rounded-[32px] bg-brand-gradient opacity-20 blur-3xl" />
            <Card className="relative overflow-hidden p-0 shadow-lift">
              <div className="flex items-center gap-2 border-b border-white/5 px-4 py-3">
                <span className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
                </span>
                <span className="ml-2 flex-1 truncate rounded-md bg-white/[0.05] px-2.5 py-1 text-[11px] text-3">
                  hobbylog.app/app
                </span>
              </div>

              <div className="space-y-3 p-4">
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { label: 'Streak', value: '14', sub: 'days', tone: 'amber' },
                    { label: 'This week', value: '6h 20m', sub: 'of 7h', tone: 'violet' },
                    { label: 'Goals hit', value: '4', sub: 'this quarter', tone: 'emerald' },
                  ].map((item) => (
                    <div key={item.label} className="surface-2 rounded-xl p-3">
                      <div className="text-[10px] uppercase tracking-wider text-3">{item.label}</div>
                      <div className="mt-1 font-display text-lg font-bold tabular">{item.value}</div>
                      <div className="text-[10.5px] text-3">{item.sub}</div>
                    </div>
                  ))}
                </div>

                {/* mock bar chart */}
                <div className="surface-2 rounded-xl p-3.5">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-[12px] font-semibold">Weekly practice</span>
                    <Badge tone="violet" size="sm">+18%</Badge>
                  </div>
                  <div className="flex h-24 items-end gap-2">
                    {[38, 62, 45, 88, 54, 96, 70].map((h, i) => (
                      <motion.div
                        key={i}
                        initial={{ height: 0 }}
                        animate={{ height: `${h}%` }}
                        transition={{ delay: 0.5 + i * 0.07, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                        className="flex-1 rounded-t-md bg-gradient-to-t from-brand-600/50 to-brand-400"
                      />
                    ))}
                  </div>
                  <div className="mt-2 flex justify-between text-[9.5px] text-3">
                    {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
                      <span key={i}>{d}</span>
                    ))}
                  </div>
                </div>

                {/* mock activity row */}
                <div className="space-y-2">
                  {[
                    { icon: '🎸', title: 'Guitar', meta: '45 min · scale practice', tone: 'amber' },
                    { icon: '⚛️', title: 'React & Frontend', meta: '60 min · refactor sprint', tone: 'sky' },
                    { icon: '📷', title: 'Street Photography', meta: '30 min · golden hour walk', tone: 'violet' },
                  ].map((row, i) => (
                    <motion.div
                      key={row.title}
                      initial={{ opacity: 0, x: -14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.7 + i * 0.1 }}
                      className="surface-2 flex items-center gap-3 rounded-xl p-2.5"
                    >
                      <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-[15px]">
                        {row.icon}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12.5px] font-semibold">{row.title}</div>
                        <div className="truncate text-[11px] text-3">{row.meta}</div>
                      </div>
                      <Badge tone={row.tone} size="sm">+{i === 0 ? '45m' : i === 1 ? '1h' : '30m'}</Badge>
                    </motion.div>
                  ))}
                </div>
              </div>
            </Card>

            {/* floating streak card */}
            <motion.div
              initial={{ opacity: 0, scale: 0.8, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ delay: 1.1, type: 'spring', stiffness: 300 }}
              className="absolute -bottom-6 -left-4 hidden sm:block"
            >
              <Card className="flex items-center gap-3 px-4 py-3 shadow-lift">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-gradient-to-br from-amber-400 to-rose-500 text-[20px] shadow-[0_10px_28px_-12px_rgba(251,191,36,0.9)]">
                  🔥
                </span>
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-3">Current streak</div>
                  <div className="font-display text-xl font-bold leading-none">14 days</div>
                </div>
              </Card>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ---------------------------------------------------------- features */}
      <section id="features" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="What it does"
            title="Everything a practice habit needs"
            subtitle="Six modules, one coherent product. Each one is backed by a real cloud service rather than a mock."
          />
          <Stagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((feature) => (
              <StaggerItem key={feature.title}>
                <Card hover className="group h-full p-6">
                  <span className="grid h-11 w-11 place-items-center rounded-xl bg-white/[0.06] text-[20px] ring-1 ring-white/10 transition-transform duration-300 group-hover:scale-110">
                    {feature.icon}
                  </span>
                  <h3 className="mt-4 text-[15.5px] font-semibold tracking-tight">{feature.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-3">{feature.body}</p>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* ------------------------------------------------------------- cloud */}
      <section id="cloud" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Architecture"
            title="Built like a cloud product, runs like a local app"
            subtitle="The same interfaces that talk to Cloud SQL and Cloud Storage in production talk to a bundled emulator locally — so the project is 100% runnable with zero accounts."
          />

          <div className="mt-14 grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <Card className="p-6 sm:p-8">
              <div className="space-y-2.5">
                {CLOUD_LAYERS.map((layer, i) => {
                  const tone = accent(layer.tone)
                  return (
                    <motion.div
                      key={layer.label}
                      initial={{ opacity: 0, x: -20 }}
                      whileInView={{ opacity: 1, x: 0 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.08 }}
                      className="group relative flex items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition hover:border-white/10 hover:bg-white/[0.04]"
                    >
                      <span
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[11px] font-bold text-white"
                        style={{
                          background: `linear-gradient(135deg, ${tone.hex}, ${tone.hex}33)`,
                          boxShadow: `0 0 20px -8px ${tone.glow}, inset 0 0 0 1px rgba(255,255,255,0.14)`,
                        }}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-[13.5px] font-semibold">{layer.label}</div>
                        <div className="truncate text-[12px] text-3">{layer.tech}</div>
                      </div>
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: tone.hex }} />
                    </motion.div>
                  )
                })}
              </div>
              <p className="mt-5 text-[12.5px] leading-relaxed text-3">
                Every request flows through a stateless API tier, so horizontal scaling is a load
                balancer away. Derived statistics are written by an event-driven worker, not by the
                request thread — the same split you would use with Cloud Functions.
              </p>
            </Card>

            <div className="space-y-4">
              <Card className="p-6">
                <h3 className="text-[15px] font-semibold">Why a cloud backend at all?</h3>
                <ul className="mt-4 space-y-3 text-[13px] leading-relaxed text-2">
                  {[
                    'Central data — your practice history follows you across every device.',
                    'Object storage — photos and recordings scale independently of the database.',
                    'Analytics — the same rows power your charts on a laptop and on a phone.',
                    'Community — one shared feed instead of isolated local silos.',
                  ].map((item) => (
                    <li key={item} className="flex gap-2.5">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                      {item}
                    </li>
                  ))}
                </ul>
              </Card>

              <Card className="p-6">
                <h3 className="text-[15px] font-semibold">Security, handled</h3>
                <div className="mt-4 grid grid-cols-2 gap-2.5 text-[12px]">
                  {[
                    ['PBKDF2', '210k iterations'],
                    ['JWT', 'HS256, expiring'],
                    ['Uploads', 'magic-byte sniffed'],
                    ['Private files', 'signed URLs'],
                    ['Rate limits', 'per IP + route'],
                    ['RBAC', 'owner / moderator'],
                  ].map(([k, v]) => (
                    <div key={k} className="surface-2 rounded-lg px-3 py-2">
                      <div className="font-semibold">{k}</div>
                      <div className="text-[11px] text-3">{v}</div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------- how it works */}
      <section id="how" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Workflow"
            title="Four steps, thirty seconds each"
            subtitle="This is exactly the flow the automated test suite walks through on every build."
          />
          <Stagger className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step) => (
              <StaggerItem key={step.n}>
                <Card hover className="relative h-full overflow-hidden p-6">
                  <span className="absolute -right-2 -top-4 font-display text-[76px] font-bold leading-none text-white/[0.04]">
                    {step.n}
                  </span>
                  <div className="relative">
                    <span className="text-[11px] font-bold tracking-[0.18em] text-brand-300">
                      STEP {step.n}
                    </span>
                    <h3 className="mt-2 text-[15px] font-semibold tracking-tight">{step.title}</h3>
                    <p className="mt-2 text-[13px] leading-relaxed text-3">{step.body}</p>
                  </div>
                </Card>
              </StaggerItem>
            ))}
          </Stagger>
        </div>
      </section>

      {/* --------------------------------------------------------- community */}
      <section id="community" className="relative px-4 py-24 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <SectionHeading
            eyebrow="Community"
            title="You are not practising alone"
            subtitle="Real (synthetic) people, real streaks, real encouragement."
          />
          <div className="mt-14 grid gap-4 lg:grid-cols-2">
            <Card className="p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="text-[15px] font-semibold">Trending this week</h3>
                <Link to="/register" className="text-[12.5px] font-semibold text-brand-300 hover:text-brand-200">
                  Join in →
                </Link>
              </div>
              <div className="space-y-3">
                {(trending?.items || []).slice(0, 4).map((post) => (
                  <div key={post.id} className="flex gap-3">
                    <Avatar user={post.author} size={36} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2">
                        <span className="truncate text-[13px] font-semibold">{post.author?.name}</span>
                        <span className="shrink-0 text-[11px] text-3">@{post.author?.username}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-2">{post.content}</p>
                      <div className="mt-1.5 flex items-center gap-3 text-[11px] text-3">
                        <span>♥ {post.likes_count}</span>
                        <span>💬 {post.comments_count}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {(!trending?.items || trending.items.length === 0) && (
                  <p className="py-6 text-center text-[13px] text-3">The feed is warming up…</p>
                )}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="mb-5 text-[15px] font-semibold">Most consistent</h3>
              <div className="space-y-2.5">
                {(leaderboard?.items || []).map((person) => (
                  <div key={person.id} className="flex items-center gap-3">
                    <span className="w-5 text-center text-[12px] font-bold text-3 tabular">
                      {person.rank}
                    </span>
                    <Avatar user={person} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[13px] font-semibold">{person.name}</div>
                      <div className="truncate text-[11.5px] text-3">
                        {humanMinutes(person.total_minutes)} logged
                      </div>
                    </div>
                    {person.rank === 1 && <span className="text-[16px]">🥇</span>}
                    {person.rank === 2 && <span className="text-[16px]">🥈</span>}
                    {person.rank === 3 && <span className="text-[16px]">🥉</span>}
                  </div>
                ))}
                {(!leaderboard?.items || leaderboard.items.length === 0) && (
                  <p className="py-6 text-center text-[13px] text-3">No leaderboard yet.</p>
                )}
              </div>
            </Card>
          </div>
        </div>
      </section>

      {/* ---------------------------------------------------------------- cta */}
      <section className="relative px-4 pb-28 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl">
          <Card className="relative overflow-hidden p-10 text-center sm:p-16">
            <div className="absolute inset-0 bg-brand-gradient opacity-[0.13]" />
            <div className="absolute -left-16 -top-16 h-64 w-64 animate-aurora rounded-full bg-brand-500/25 blur-3xl" />
            <div className="relative">
              <h2 className="font-display text-[clamp(1.9rem,4.5vw,3rem)] font-bold leading-tight tracking-tight">
                Your streak starts <span className="text-gradient">today</span>
              </h2>
              <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-2">
                Create an account, add one skill, log ten minutes. That is the whole commitment —
                the rest is momentum.
              </p>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
                <Link to="/register">
                  <Button variant="primary" size="lg">
                    Create free account
                  </Button>
                </Link>
                <Link to="/login">
                  <Button variant="ghost" size="lg">
                    Use the demo account
                  </Button>
                </Link>
              </div>
            </div>
          </Card>
        </div>
      </section>

      {/* ------------------------------------------------------------- footer */}
      <footer className="border-t border-white/5 px-4 py-10 sm:px-6 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-6 sm:flex-row">
          <div className="flex items-center gap-3">
            <Brand to="/" />
            <span className="text-[12px] text-3">· Track every skill. Share every win.</span>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-5 text-[12.5px] text-3">
            <span className="font-medium text-2">Harsha K S</span>
            <span className="hidden sm:inline">·</span>
            <span>Cloud Computing project</span>
            <span className="hidden sm:inline">·</span>
            <span>React · FastAPI · Cloud SQL · Object Storage</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

function SectionHeading({ eyebrow, title, subtitle }) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <span className="text-[11px] font-bold uppercase tracking-[0.2em] text-brand-300">{eyebrow}</span>
      <h2 className="mt-3 font-display text-[clamp(1.8rem,4vw,2.7rem)] font-bold leading-tight tracking-tight">
        {title}
      </h2>
      {subtitle && <p className="mt-3.5 text-[15px] leading-relaxed text-2">{subtitle}</p>}
    </div>
  )
}
