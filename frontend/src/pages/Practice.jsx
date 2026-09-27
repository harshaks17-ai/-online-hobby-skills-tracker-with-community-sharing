import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { practiceApi, skillsApi } from '../lib/api'
import { useAsync, useDebounced, useStoredState } from '../lib/hooks'
import { humanMinutes, longDate, timeAgo, weekday } from '../lib/format'
import { MOODS, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import { AreaChart, DayBars } from '../components/charts'
import { LogPracticeModal } from '../components/practice/LogPracticeModal'
import {
  Button, Card, ConfirmDialog, EmptyState, Input, PillGroup, Select,
} from '../components/ui'

const RANGES = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 365, label: 'Year' },
]

export default function Practice() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [logOpen, setLogOpen] = useState(searchParams.get('new') === '1')
  const [skillFilter, setSkillFilter] = useState('all')
  const [range, setRange] = useStoredState('practice.range', 30)
  const [search, setSearch] = useState('')
  const [deleting, setDeleting] = useState(null)
  const debouncedSearch = useDebounced(search, 300)

  const { data: skillsData } = useAsync(() => skillsApi.list(), [])
  const skills = skillsData?.items || []

  const { data, loading, refetch } = useAsync(
    () =>
      practiceApi.list({
        skill_id: skillFilter === 'all' ? undefined : skillFilter,
        days: range,
        search: debouncedSearch || undefined,
        limit: 200,
      }),
    [skillFilter, range, debouncedSearch],
  )
  const { data: streakData, refetch: refetchStreak } = useAsync(() => practiceApi.streak(), [])

  const sessions = data?.items || []

  // Group by day so the timeline reads like a journal.
  const grouped = useMemo(() => {
    const map = new Map()
    sessions.forEach((session) => {
      const key = new Date(session.practiced_at).toDateString()
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(session)
    })
    return [...map.entries()].slice(0, 60)
  }, [sessions])

  const totals = useMemo(() => {
    const minutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
    const days = new Set(sessions.map((s) => new Date(s.practiced_at).toDateString())).size
    return { minutes, hours: minutes / 60, sessions: sessions.length, days, avg: days ? minutes / days : 0 }
  }, [sessions])

  const closeLog = () => {
    setLogOpen(false)
    if (searchParams.get('new')) {
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const afterLog = async () => {
    await Promise.all([refetch(), refetchStreak()])
  }

  const remove = async () => {
    try {
      await practiceApi.remove(deleting.id)
      toast.success('Session removed and totals recalculated.')
      setDeleting(null)
      refetch()
      refetchStreak()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const update = async (session, patch) => {
    try {
      await practiceApi.update(session.id, patch)
      toast.success('Session updated — streaks and goals recalculated.')
      refetch()
      refetchStreak()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Page className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Log Practice</h1>
          <p className="mt-1 text-[13.5px] text-3">
            Every session you record, and everything it moved.
          </p>
        </div>
        <Button variant="primary" id="logPractice" onClick={() => setLogOpen(true)}>
          <span className="text-base leading-none">+</span> Log Practice
        </Button>
      </div>

      {/* summary */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: 'Total time', value: humanMinutes(totals.minutes), icon: '⏱️', tone: 'violet' },
          { label: 'Sessions', value: totals.sessions, icon: '📝', tone: 'sky' },
          { label: 'Active days', value: totals.days, icon: '📅', tone: 'emerald' },
          { label: 'Daily average', value: humanMinutes(totals.avg), icon: '📈', tone: 'amber' },
          {
            label: 'Current streak',
            value: `${streakData?.current_streak || 0}d`,
            icon: '🔥',
            tone: 'orange',
          },
        ].map((item) => (
          <Card key={item.label} className="flex items-center gap-3 p-4">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px] ring-1 ring-white/10"
              style={{ background: `${accent(item.tone).hex}22` }}
            >
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="text-[10.5px] uppercase tracking-wider text-3">{item.label}</p>
              <p className="truncate text-[17px] font-bold tabular">{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card className="p-6">
          <h2 className="text-[15px] font-semibold tracking-tight">Last 7 days</h2>
          <p className="mt-0.5 mb-4 text-[12.5px] text-3">Minutes per day</p>
          {streakData?.days?.length ? (
            <DayBars data={streakData.days} tone="violet" height={140} />
          ) : (
            <div className="skeleton h-[140px]" />
          )}
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold tracking-tight">Daily volume</h2>
              <p className="mt-0.5 text-[12.5px] text-3">How your practice is distributed</p>
            </div>
          </div>
          {sessions.length ? (
            <AreaChart
              data={[...sessions]
                .reverse()
                .slice(-30)
                .map((s) => ({
                  label: `${new Date(s.practiced_at).getDate()}/${new Date(s.practiced_at).getMonth() + 1}`,
                  minutes: s.duration_minutes,
                }))}
              xKey="label"
              yKey="minutes"
              tone="cyan"
              height={180}
            />
          ) : (
            <div className="grid h-[180px] place-items-center text-[13px] text-3">
              No sessions in this range.
            </div>
          )}
        </Card>
      </div>

      {/* filters */}
      <div className="flex flex-wrap items-center gap-3">
        <PillGroup
          items={[
            { id: 'all', label: 'All skills' },
            ...skills.map((s) => ({ id: s.id, label: `${s.icon} ${s.title}` })),
          ]}
          value={skillFilter}
          onChange={setSkillFilter}
          className="min-w-0 flex-1"
        />
        <div className="flex items-center gap-2">
          <div className="relative">
            <Input
              placeholder="Search notes…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-44 pl-9"
              aria-label="Search practice notes"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-3">⌕</span>
          </div>
          <Select value={range} onChange={(e) => setRange(Number(e.target.value))} className="w-28" aria-label="Date range">
            {RANGES.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      {/* timeline */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skeleton h-24 rounded-2xl" />
          ))}
        </div>
      ) : sessions.length === 0 ? (
        <Card>
          <EmptyState
            icon="📝"
            title="Nothing logged in this range"
            message="Log a session and it will show up here, with your streak and goals updated instantly."
            action={
              <Button variant="primary" onClick={() => setLogOpen(true)}>
                Log your first session
              </Button>
            }
          />
        </Card>
      ) : (
        <Stagger className="space-y-6">
          {grouped.map(([day, daySessions]) => {
            const dayTotal = daySessions.reduce((sum, s) => sum + s.duration_minutes, 0)
            return (
              <StaggerItem key={day}>
                <div className="mb-3 flex items-center gap-3">
                  <span className="chip">
                    {weekday(daySessions[0].practiced_at)} · {longDate(daySessions[0].practiced_at)}
                  </span>
                  <span className="text-[12px] font-semibold text-2">{humanMinutes(dayTotal)}</span>
                  <div className="divider flex-1" />
                </div>
                <div className="space-y-2.5">
                  {daySessions.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      onDelete={() => setDeleting(session)}
                      onUpdate={(patch) => update(session, patch)}
                    />
                  ))}
                </div>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}

      <LogPracticeModal
        open={logOpen}
        onClose={closeLog}
        skills={skills}
        defaultSkillId={searchParams.get('skill')}
        onLogged={afterLog}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this session?"
        message={`${humanMinutes(deleting?.duration_minutes || 0)} on ${
          deleting?.skill_title || 'your skill'
        } will be removed. Totals, streaks and goal progress are all recalculated automatically.`}
        confirmLabel="Delete session"
      />
    </Page>
  )
}

function SessionRow({ session, onDelete, onUpdate }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.duration_minutes)
  const mood = MOODS.find((m) => m.id === session.mood)

  return (
    <Card className="group flex flex-wrap items-center gap-4 p-4 transition hover:border-white/10 sm:flex-nowrap">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[20px] ring-1 ring-white/10"
        style={{ background: `${accent(session.skill_accent).hex}22` }}
      >
        {session.skill_icon || '⏱️'}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[14px] font-semibold">{session.skill_title || 'Practice'}</span>
          {session.activity && (
            <span className="truncate text-[12.5px] text-2">· {session.activity}</span>
          )}
          {mood && <span className="text-[13px]" title={`Mood: ${mood.label}`}>{mood.icon}</span>}
        </div>
        {session.notes && (
          <p className="mt-1 line-clamp-2 text-[12.5px] leading-relaxed text-3">{session.notes}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-3">
          <span>{timeAgo(session.practiced_at)}</span>
          {session.media_url && <span className="text-brand-300">📎 proof attached</span>}
        </div>
      </div>

      <div className="shrink-0 text-right">
        {editing ? (
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              min="1"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="w-20 py-1.5 text-center"
              autoFocus
            />
            <Button
              size="icon-sm"
              variant="primary"
              aria-label="Save"
              onClick={() => {
                onUpdate({ duration_minutes: Number(draft) })
                setEditing(false)
              }}
            >
              ✓
            </Button>
            <Button size="icon-sm" variant="quiet" aria-label="Cancel" onClick={() => setEditing(false)}>
              ✕
            </Button>
          </div>
        ) : (
          <>
            <div className="text-[16px] font-bold tabular">{humanMinutes(session.duration_minutes)}</div>
            <div className="text-[10.5px] uppercase tracking-wider text-3">minutes</div>
          </>
        )}
      </div>

      <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
        <Button variant="quiet" size="icon-sm" onClick={() => setEditing((e) => !e)} aria-label="Edit duration">
          ✎
        </Button>
        <Button variant="quiet" size="icon-sm" onClick={onDelete} aria-label="Delete session">
          🗑
        </Button>
      </div>
    </Card>
  )
}
