import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { communityApi } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { compactNumber, humanMinutes, monthDay } from '../lib/format'
import { CATEGORY_MAP, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import { AreaChart, BarChart } from '../components/charts'
import { Avatar, Badge, Button, Card, CardHeader, EmptyState, Progress, Skeleton } from '../components/ui'

const MEDALS = ['🥇', '🥈', '🥉']

const PODIUM_RINGS = [
  'from-amber-300/80 via-amber-400/30 to-transparent',
  'from-slate-300/70 via-slate-400/20 to-transparent',
  'from-orange-400/70 via-amber-600/20 to-transparent',
]

const PODIUM_SIZES = ['lg:h-[252px] lg:p-7', 'h-[214px] p-5', 'h-[190px] p-5']

const ROW_TONES = ['violet', 'sky', 'emerald', 'amber', 'pink', 'cyan']

export default function Leaderboard() {
  const { user } = useAuth()

  const { data, loading } = useAsync(() => communityApi.leaderboard({ limit: 50 }), [])
  const { data: categoriesData } = useAsync(() => communityApi.categories(), [])
  const { data: activityData } = useAsync(() => communityApi.activity(), [])
  const { data: stats } = useAsync(() => communityApi.stats(), [])

  const entries = data?.items || []
  const podium = entries.length >= 3 ? [entries[1], entries[0], entries[2]] : entries
  const rest = entries.length > 3 ? entries.slice(3) : entries

  const maxMinutes = useMemo(
    () => entries.reduce((max, person) => Math.max(max, person.total_minutes || 0), 0) || 1,
    [entries],
  )

  const activity = useMemo(
    () => (activityData?.items || []).map((day) => ({ label: monthDay(day.date), sessions: day.sessions })),
    [activityData],
  )

  const categoryBars = useMemo(
    () =>
      (categoriesData?.items || [])
        .slice(0, 8)
        .map((row) => ({
          label: CATEGORY_MAP[row.category]?.label || row.category,
          icon: CATEGORY_MAP[row.category]?.icon,
          value: row.minutes,
          accent: CATEGORY_MAP[row.category]?.accent,
        })),
    [categoriesData],
  )

  const myUsername = user?.username

  return (
    <Page className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">Leaderboard</h1>
        <p className="mt-1 text-[13.5px] text-3">
          Ranked by logged practice minutes. Public numbers only — every session counts, none of them are
          estimated.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0 space-y-5">
          {loading ? (
            <>
              <div className="grid grid-cols-3 items-end gap-3">
                {['h-[214px]', 'h-[252px]', 'h-[190px]'].map((size, i) => (
                  <Skeleton key={i} className={`${size} rounded-2xl`} />
                ))}
              </div>
              <div className="space-y-3">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-[86px] rounded-2xl" />
                ))}
              </div>
            </>
          ) : entries.length === 0 ? (
            <Card>
              <EmptyState
                icon="🏆"
                title="The leaderboard is empty"
                message="It fills up as soon as people start logging sessions. Log your first one and take the top spot."
                action={
                  <Link to="/app/practice">
                    <Button variant="primary">Log a session</Button>
                  </Link>
                }
              />
            </Card>
          ) : (
            <>
              <Stagger className="grid grid-cols-3 items-end gap-3">
                {podium.map((person) => (
                  <StaggerItem key={person.id}>
                    <PodiumCard person={person} maxMinutes={maxMinutes} isYou={person.username === myUsername} />
                  </StaggerItem>
                ))}
              </Stagger>

              {rest.length > 0 && (
                <Card className="p-5">
                  <CardHeader
                    title={entries.length > 3 ? 'The rest of the board' : 'Full ranking'}
                    subtitle={`${compactNumber(entries.length)} people ranked by minutes logged`}
                    className="mb-4"
                  />
                  <div className="space-y-2.5">
                    {rest.map((person, index) => (
                      <RankRow
                        key={person.id}
                        person={person}
                        maxMinutes={maxMinutes}
                        tone={ROW_TONES[index % ROW_TONES.length]}
                        isYou={person.username === myUsername}
                      />
                    ))}
                  </div>
                </Card>
              )}
            </>
          )}
        </div>

        {/* ------------------------------------------------------- side panel */}
        <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card className="p-5">
            <CardHeader title="Platform" subtitle="Everything the community has logged" />
            <div className="mt-4 grid grid-cols-2 gap-2.5">
              {[
                { label: 'Members', value: compactNumber(stats?.users ?? 0), icon: '👥', tone: 'violet' },
                { label: 'Sessions', value: compactNumber(stats?.sessions ?? 0), icon: '⚡', tone: 'sky' },
                { label: 'Practice hours', value: compactNumber(stats?.practice_hours ?? 0), icon: '⏳', tone: 'emerald' },
                { label: 'Skills', value: compactNumber(stats?.skills ?? 0), icon: '🧩', tone: 'amber' },
                { label: 'Posts', value: compactNumber(stats?.posts ?? 0), icon: '💬', tone: 'pink' },
                { label: 'Goals', value: compactNumber(stats?.goals ?? 0), icon: '🎯', tone: 'cyan' },
              ].map((item) => (
                <div key={item.label} className="surface-2 rounded-xl p-3">
                  <div className="flex items-center gap-2">
                    <span
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-lg text-[12px] ring-1 ring-white/10"
                      style={{ background: `${accent(item.tone).hex}22` }}
                    >
                      {item.icon}
                    </span>
                    <span className="truncate text-[10.5px] uppercase tracking-wider text-3">{item.label}</span>
                  </div>
                  <p className="mt-1.5 text-[18px] font-bold tabular">{item.value}</p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Community activity" subtitle="Sessions logged each day, lately" />
            <div className="mt-4">
              {activityData === null && !activity.length ? (
                <Skeleton className="h-[220px] rounded-xl" />
              ) : (
                <AreaChart
                  data={activity}
                  xKey="label"
                  yKey="sessions"
                  height={200}
                  formatValue={compactNumber}
                  formatTick={compactNumber}
                />
              )}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Where the hours go" subtitle="Community minutes by category" />
            <div className="mt-4">
              {categoryBars.length === 0 ? (
                <Skeleton className="h-[220px] rounded-xl" />
              ) : (
                <BarChart data={categoryBars} horizontal formatValue={humanMinutes} />
              )}
            </div>
          </Card>
        </aside>
      </div>
    </Page>
  )
}

/* ------------------------------------------------------------ podium card */
function PodiumCard({ person, maxMinutes, isYou }) {
  const place = Math.max(1, Number(person.rank) || 1)
  const slot = Math.min(3, place) - 1
  const medal = MEDALS[slot]
  const minutes = Number(person.total_minutes) || 0

  return (
    <div className={`h-full rounded-2xl bg-gradient-to-b p-px ${PODIUM_RINGS[slot]}`}>
      <Card
        className={`flex h-full flex-col items-center justify-center gap-2.5 text-center ${PODIUM_SIZES[slot]}`}
      >
        <span className="text-[26px] leading-none" aria-hidden="true">
          {medal}
        </span>
        <Link to={`/u/${person.username}`} className="rounded-full transition hover:scale-105">
          <Avatar user={person} size={slot === 0 ? 66 : 52} />
        </Link>
        <div className="min-w-0 w-full">
          <div className="flex items-center justify-center gap-1.5">
            <Link
              to={`/u/${person.username}`}
              className="truncate font-semibold tracking-tight hover:text-brand-300"
              style={{ fontSize: slot === 0 ? '15.5px' : '13.5px' }}
            >
              {person.name}
            </Link>
            {isYou && (
              <Badge tone="brand" size="sm">
                You
              </Badge>
            )}
          </div>
          <p className="truncate text-[11.5px] text-3">@{person.username}</p>
        </div>
        <p className="text-[17px] font-bold tabular">{humanMinutes(minutes)}</p>
        <div className="w-full">
          <Progress
            value={(minutes / maxMinutes) * 100}
            tone={slot === 0 ? 'amber' : slot === 1 ? 'slate' : 'orange'}
            size={slot === 0 ? 'md' : 'sm'}
          />
        </div>
        <p className="text-[11px] text-3">{compactNumber(person.total_sessions)} sessions</p>
      </Card>
    </div>
  )
}

/* --------------------------------------------------------------- rank row */
function RankRow({ person, maxMinutes, tone, isYou }) {
  const minutes = Number(person.total_minutes) || 0

  return (
    <motion.div
      whileHover={{ x: 2 }}
      transition={{ duration: 0.2 }}
      className={`flex items-center gap-3.5 rounded-xl border p-3 transition ${
        isYou
          ? 'border-brand-400/40 bg-brand-500/[0.08] ring-1 ring-brand-400/30'
          : 'border-white/5 bg-white/[0.02] hover:border-white/10'
      }`}
    >
      <span className="w-6 shrink-0 text-center text-[13px] font-bold tabular text-3">
        {person.rank}
      </span>
      <Link to={`/u/${person.username}`} className="shrink-0 rounded-full">
        <Avatar user={person} size={38} />
      </Link>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link
            to={`/u/${person.username}`}
            className="truncate text-[13.5px] font-semibold hover:text-brand-300"
          >
            {person.name}
          </Link>
          {isYou && (
            <Badge tone="brand" size="sm">
              You
            </Badge>
          )}
          <span className="truncate text-[11.5px] text-3">@{person.username}</span>
        </div>
        <div className="mt-1.5 flex items-center gap-3">
          <Progress value={(minutes / maxMinutes) * 100} tone={tone} size="sm" className="flex-1" />
          <span className="w-16 shrink-0 text-right text-[12px] font-semibold tabular">
            {humanMinutes(minutes)}
          </span>
          <span className="hidden w-24 shrink-0 text-right text-[11.5px] tabular text-3 sm:block">
            {compactNumber(person.total_sessions)} sessions
          </span>
        </div>
      </div>
    </motion.div>
  )
}
