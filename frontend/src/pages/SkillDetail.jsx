import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { practiceApi, skillsApi } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { humanMinutes, longDate, percentLabel, timeAgo, weekday } from '../lib/format'
import { CATEGORY_MAP, STATUS_TONE, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import { AreaChart } from '../components/charts'
import { LogPracticeModal } from '../components/practice/LogPracticeModal'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Progress, Segmented,
} from '../components/ui'

export default function SkillDetail() {
  const { id } = useParams()
  const toast = useToast()
  const navigate = useNavigate()
  const [logOpen, setLogOpen] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [range, setRange] = useState(30)

  const { data, loading, refetch } = useAsync(() => skillsApi.get(id), [id])

  const skill = data?.skill
  const sessions = data?.sessions || []
  const goals = data?.goals || []

  const stats = useMemo(() => {
    const minutes = sessions.reduce((sum, s) => sum + (s.duration_minutes || 0), 0)
    const days = new Set(sessions.map((s) => new Date(s.practiced_at).toDateString())).size
    const byDay = {}
    sessions.forEach((s) => {
      const key = new Date(s.practiced_at).toDateString()
      byDay[key] = (byDay[key] || 0) + s.duration_minutes
    })
    const series = Object.entries(byDay)
      .sort(([a], [b]) => new Date(a) - new Date(b))
      .slice(-range)
      .map(([date, value]) => ({ label: `${date.slice(8, 10)}/${date.slice(5, 7)}`, minutes: value }))
    return {
      minutes,
      hours: minutes / 60,
      days,
      average: days ? minutes / days : 0,
      series,
      longest: sessions.length ? Math.max(...sessions.map((s) => s.duration_minutes)) : 0,
    }
  }, [sessions, range])

  const removeSession = async (session) => {
    try {
      await practiceApi.remove(session.id)
      toast.success('Session removed.')
      refetch()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const remove = async () => {
    try {
      await skillsApi.remove(id)
      toast.success('Skill deleted.')
      navigate('/app/skills')
    } catch (err) {
      toast.error(err.message)
    }
  }

  if (loading) {
    return (
      <Page className="space-y-6">
        <div className="skeleton h-56 rounded-2xl" />
        <div className="grid gap-4 lg:grid-cols-3">
          <div className="skeleton h-72 rounded-2xl lg:col-span-2" />
          <div className="skeleton h-72 rounded-2xl" />
        </div>
      </Page>
    )
  }

  if (!skill) {
    return (
      <Page>
        <Card>
          <EmptyState
            icon="🔍"
            title="Skill not found"
            message="It may have been deleted, or the link is wrong."
            action={
              <Button variant="primary" onClick={() => navigate('/app/skills')}>
                Back to my skills
              </Button>
            }
          />
        </Card>
      </Page>
    )
  }

  const tone = skill.accent || 'violet'

  return (
    <Page className="space-y-6">
      <div className="flex items-center gap-2 text-[12.5px] text-3">
        <Link to="/app/skills" className="hover:text-1">
          My skills
        </Link>
        <span>/</span>
        <span className="text-1">{skill.title}</span>
      </div>

      {/* hero */}
      <Card className="relative overflow-hidden p-6 sm:p-8">
        <div
          className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl"
          style={{ background: accent(tone).glow }}
        />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex min-w-0 gap-5">
            <span
              className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl text-[30px] ring-1 ring-white/10"
              style={{ background: `${accent(tone).hex}22` }}
            >
              {skill.icon}
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight">
                {skill.title}
              </h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge tone={STATUS_TONE[skill.status] || 'violet'} dot>
                  {skill.status}
                </Badge>
                <Badge tone="slate">{skill.current_level}</Badge>
                {skill.current_level !== skill.target_level && (
                  <Badge tone="sky">
                    → {skill.target_level}
                  </Badge>
                )}
                <Badge tone="violet">
                  {CATEGORY_MAP[skill.category]?.icon} {CATEGORY_MAP[skill.category]?.label || skill.category}
                </Badge>
              </div>
              {skill.description && (
                <p className="mt-3 max-w-2xl text-[13.5px] leading-relaxed text-2">{skill.description}</p>
              )}
              <p className="mt-2.5 text-[12px] text-3">
                Started {longDate(skill.start_date)}
                {skill.target_date && ` · target ${longDate(skill.target_date)}`}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-2.5">
            <Button variant="primary" onClick={() => setLogOpen(true)}>
              Log practice
            </Button>
            <Button variant="ghost" onClick={() => navigate('/app/goals?new=1')}>
              Set a goal
            </Button>
            <Button variant="quiet" onClick={() => setDeleting(true)} aria-label="Delete skill">
              🗑
            </Button>
          </div>
        </div>

        <div className="relative mt-7 grid gap-4 border-t border-white/5 pt-6 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { label: 'Total time', value: humanMinutes(stats.minutes), sub: `${stats.hours.toFixed(1)} hours` },
            { label: 'Sessions', value: stats.sessions || skill.session_count, sub: `${stats.days} active days` },
            {
              label: 'This week',
              value: humanMinutes(skill.weekly_minutes),
              sub: `of ${humanMinutes(skill.goal_per_week)} target`,
            },
            {
              label: 'Streak',
              value: skill.current_streak > 0 ? `${skill.current_streak} days` : '—',
              sub: 'consecutive practice days',
            },
          ].map((item) => (
            <div key={item.label}>
              <p className="text-[10.5px] uppercase tracking-wider text-3">{item.label}</p>
              <p className="mt-1 font-display text-[22px] font-bold leading-none tabular">{item.value}</p>
              <p className="mt-1 text-[11.5px] text-3">{item.sub}</p>
            </div>
          ))}
        </div>

        <div className="relative mt-5">
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-3">Weekly target</span>
            <span className="font-semibold tabular">
              {humanMinutes(skill.weekly_minutes)} / {humanMinutes(skill.goal_per_week)} (
              {Math.round(skill.progress_percent)}%)
            </span>
          </div>
          <Progress value={skill.progress_percent} tone={tone} size="md" />
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15.5px] font-semibold tracking-tight">Practice volume</h2>
              <p className="mt-0.5 text-[12.5px] text-3">Minutes per session day</p>
            </div>
            <Segmented
              options={[
                { id: 14, label: '2 weeks' },
                { id: 30, label: 'Month' },
                { id: 90, label: 'Quarter' },
              ]}
              value={range}
              onChange={setRange}
            />
          </div>
          {stats.series.length ? (
            <AreaChart data={stats.series} xKey="label" yKey="minutes" tone={tone} height={230} />
          ) : (
            <EmptyState
              icon="📈"
              title="No sessions yet"
              message="Log your first session and this chart fills in immediately."
              action={
                <Button variant="primary" onClick={() => setLogOpen(true)}>
                  Log practice
                </Button>
              }
            />
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Goals for this skill</h2>
          <p className="mt-0.5 text-[12.5px] text-3">{goals.length} attached</p>
          <div className="mt-4 space-y-3">
            {goals.map((goal) => (
              <div key={goal.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{goal.title}</span>
                  <Badge tone={goal.status === 'COMPLETED' ? 'emerald' : 'violet'} size="sm">
                    {percentLabel(goal.progress_percent)}%
                  </Badge>
                </div>
                <p className="mt-0.5 text-[11.5px] text-3">
                  {goal.current_value} / {goal.target_value} {goal.unit}
                </p>
                <div className="mt-2">
                  <Progress
                    value={goal.progress_percent}
                    tone={goal.status === 'COMPLETED' ? 'emerald' : goal.skill_accent}
                    size="xs"
                  />
                </div>
                {goal.milestones?.length > 0 && (
                  <div className="mt-2.5 flex gap-1">
                    {goal.milestones.map((milestone) => (
                      <span
                        key={milestone.id}
                        title={milestone.title}
                        className={`h-1.5 flex-1 rounded-full ${
                          milestone.achieved ? 'bg-emerald-400' : 'bg-white/10'
                        }`}
                      />
                    ))}
                  </div>
                )}
              </div>
            ))}
            {goals.length === 0 && (
              <div className="py-6 text-center">
                <p className="text-[12.5px] text-3">No goals linked to this skill.</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="mt-3"
                  onClick={() => navigate('/app/goals?new=1')}
                >
                  Create a goal
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* session history */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Session history</h2>
          <span className="text-[12.5px] text-3">
            {data?.total_sessions || sessions.length} total
          </span>
        </div>
        {sessions.length === 0 ? (
          <EmptyState icon="📝" title="Nothing logged yet" message="Your sessions will appear here." />
        ) : (
          <Stagger className="space-y-2.5">
            {sessions.map((session) => (
              <StaggerItem key={session.id}>
                <div className="group flex flex-wrap items-center gap-4 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition hover:border-white/10">
                  <div className="w-20 shrink-0 text-center">
                    <div className="text-[11px] uppercase text-3">{weekday(session.practiced_at)}</div>
                    <div className="text-[13px] font-bold">
                      {new Date(session.practiced_at).getDate()}/{new Date(session.practiced_at).getMonth() + 1}
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    {session.activity && <p className="truncate text-[13px] font-semibold">{session.activity}</p>}
                    {session.notes && (
                      <p className="mt-0.5 line-clamp-1 text-[12px] text-3">{session.notes}</p>
                    )}
                    <p className="mt-0.5 text-[11px] text-3">{timeAgo(session.practiced_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[15px] font-bold tabular">
                      {humanMinutes(session.duration_minutes)}
                    </div>
                  </div>
                  <Button
                    variant="quiet"
                    size="icon-sm"
                    className="opacity-0 transition group-hover:opacity-100"
                    onClick={() => removeSession(session)}
                    aria-label="Delete session"
                  >
                    🗑
                  </Button>
                </div>
              </StaggerItem>
            ))}
          </Stagger>
        )}
      </Card>

      <LogPracticeModal
        open={logOpen}
        onClose={() => setLogOpen(false)}
        skills={[skill]}
        defaultSkillId={skill.id}
        onLogged={refetch}
      />

      <ConfirmDialog
        open={deleting}
        onClose={() => setDeleting(false)}
        onConfirm={remove}
        title="Delete this skill?"
        message={`“${skill.title}” and its ${sessions.length} sessions, goals and milestones will be permanently removed.`}
        confirmLabel="Delete skill"
      />
    </Page>
  )
}
