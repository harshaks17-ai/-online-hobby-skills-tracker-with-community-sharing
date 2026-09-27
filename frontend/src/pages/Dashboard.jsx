import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { analyticsApi, practiceApi } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { compactNumber, firstName, greeting, humanMinutes, percentLabel, timeAgo } from '../lib/format'
import { accent, CATEGORY_MAP } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import { AreaChart, DayBars, DonutChart, Heatmap, Sparkline } from '../components/charts'
import { LogPracticeModal } from '../components/practice/LogPracticeModal'
import {
  Badge, Button, Card, EmptyState, Progress, RadialProgress, Segmented, Tooltip,
} from '../components/ui'

/* --------------------------------------------------------------- stat tile */
function StatTile({ label, value, sub, icon, tone = 'violet', trend, spark, to }) {
  const body = (
    <Card hover className="group relative h-full overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-60"
        style={{ background: accent(tone).glow }}
      />
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-3">{label}</p>
          <p className="mt-2 font-display text-[26px] font-bold leading-none tabular">{value}</p>
          {sub && <p className="mt-1.5 truncate text-[12px] text-3">{sub}</p>}
        </div>
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px] ring-1 ring-white/10"
          style={{ background: `${accent(tone).hex}22` }}
        >
          {icon}
        </span>
      </div>
      <div className="relative mt-3 flex items-end justify-between gap-3">
        {trend !== undefined && (
          <span className={`text-[11.5px] font-semibold ${trend >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
            {trend >= 0 ? '▲' : '▼'} {Math.abs(trend)}% vs last week
          </span>
        )}
        {spark && <Sparkline data={spark} yKey="minutes" tone={tone} width={92} height={28} />}
      </div>
    </Card>
  )
  return to ? <Link to={to}>{body}</Link> : body
}

/* ---------------------------------------------------------------- dashboard */
export default function Dashboard() {
  const { user, refresh: refreshAuth } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [logOpen, setLogOpen] = useState(searchParams.get('new') === '1')
  const [activityFilter, setActivityFilter] = useState('all')

  const { data, loading, refetch } = useAsync(() => analyticsApi.dashboard(), [])
  const { data: streakData } = useAsync(() => practiceApi.streak(), [])
  const { data: badgeData } = useAsync(() => analyticsApi.badges(), [])

  const headline = data?.headline
  const charts = data?.charts

  const weekly = useMemo(() => charts?.weekly_trend || [], [charts])
  const lastWeekMinutes = weekly.length >= 2 ? weekly[weekly.length - 2]?.minutes || 0 : 0
  const thisWeekMinutes = weekly.length ? weekly[weekly.length - 1]?.minutes || 0 : 0
  const trend = lastWeekMinutes
    ? Math.round(((thisWeekMinutes - lastWeekMinutes) / lastWeekMinutes) * 100)
    : undefined

  const activity = useMemo(() => {
    const items = data?.recent_activity || []
    if (activityFilter === 'all') return items
    return items.filter((item) => item.type === activityFilter)
  }, [data, activityFilter])

  const earnedBadges = (badgeData?.items || []).filter((b) => b.earned)
  const lockedBadges = (badgeData?.items || []).filter((b) => !b.earned)

  const closeLog = () => {
    setLogOpen(false)
    if (searchParams.get('new')) {
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const afterLog = async () => {
    await Promise.all([refetch(), refreshAuth()])
  }

  if (loading) return <DashboardSkeleton />

  const streak = streakData?.current_streak ?? headline?.current_streak ?? 0

  return (
    <Page className="space-y-6">
      {/* ------------------------------------------------------------- hero */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="card relative overflow-hidden p-6 sm:p-8"
      >
        <div className="absolute inset-0 bg-brand-gradient opacity-[0.09]" />
        <div className="absolute -right-20 -top-24 h-64 w-64 animate-aurora rounded-full bg-brand-500/25 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <p className="text-[12.5px] font-semibold uppercase tracking-[0.16em] text-brand-300">
              {greeting()}, {firstName(user?.name)}
            </p>
            <h1 className="mt-2 font-display text-[clamp(1.7rem,4vw,2.4rem)] font-bold leading-tight tracking-tight">
              {streak > 0 ? (
                <>
                  You are on a <span className="text-gradient-warm">{streak}-day streak</span>.
                </>
              ) : (
                <>
                  Ready to start a <span className="text-gradient">streak</span>?
                </>
              )}
            </h1>
            <p className="mt-2.5 max-w-lg text-[14px] leading-relaxed text-2">
              {streak > 0
                ? `Streak: ${streak} day${streak === 1 ? '' : 's'}. Longest run: ${
                    headline?.longest_streak || 0
                  } days. Keep it alive with one session today.`
                : 'Log your first session and the streak, charts and badges all start moving at once.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button variant="primary" onClick={() => setLogOpen(true)}>
                Log practice
              </Button>
              <Button variant="ghost" onClick={() => navigate('/app/skills?new=1')}>
                Add a skill
              </Button>
              <Button variant="ghost" onClick={() => navigate('/app/feed')}>
                Share an update
              </Button>
            </div>
          </div>

          {/* weekly ring + streak tiles */}
          <div className="flex shrink-0 items-center gap-5">
            <div className="relative">
              <RadialProgress
                value={headline?.weekly_progress_percent || 0}
                size={132}
                stroke={11}
                tone="violet"
              >
                <div>
                  <div className="font-display text-[22px] font-bold leading-none tabular">
                    {humanMinutes(headline?.weekly_minutes || 0)}
                  </div>
                  <div className="mt-0.5 text-[10px] uppercase tracking-wider text-3">
                    of {humanMinutes(headline?.weekly_target_minutes || 0)}
                  </div>
                </div>
              </RadialProgress>
            </div>
            <div className="space-y-2.5">
              {[
                { label: 'Current streak', value: `${streak}d`, tone: 'amber', icon: '🔥' },
                { label: 'Longest streak', value: `${headline?.longest_streak || 0}d`, tone: 'orange', icon: '🏆' },
                { label: 'Active days', value: headline?.total_sessions ? `${compactNumber(data?.stats?.active_days || 0)}d` : '0d', tone: 'emerald', icon: '📅' },
              ].map((item) => (
                <div key={item.label} className="surface-2 flex items-center gap-3 rounded-xl px-3.5 py-2.5">
                  <span className="text-[16px]">{item.icon}</span>
                  <div>
                    <div className="text-[10.5px] uppercase tracking-wider text-3">{item.label}</div>
                    <div className="text-[15px] font-bold tabular">{item.value}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* last 7 days strip */}
        {streakData?.days?.length > 0 && (
          <div className="relative mt-7 border-t border-white/5 pt-5">
            <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-3">
              Last 7 days
            </p>
            <DayBars data={streakData.days} tone="amber" height={78} />
          </div>
        )}
      </motion.div>

      {/* ------------------------------------------------------------ stats */}
      <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StaggerItem>
          <StatTile
            label="Total practice"
            value={`${(headline?.total_hours ?? 0).toFixed(1)}h`}
            sub={`${compactNumber(headline?.total_sessions || 0)} sessions logged`}
            icon="⏱️"
            tone="violet"
            trend={trend}
            spark={weekly.slice(-8)}
            to="/app/analytics"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Active skills"
            value={headline?.active_skills ?? 0}
            sub={`${headline?.total_skills || 0} tracked in total`}
            icon="🎯"
            tone="sky"
            to="/app/skills"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Goals completed"
            value={headline?.goals_completed ?? 0}
            sub={`${headline?.goals_active || 0} still in progress`}
            icon="🏁"
            tone="emerald"
            to="/app/goals"
          />
        </StaggerItem>
        <StaggerItem>
          <StatTile
            label="Community reach"
            value={compactNumber((headline?.likes_received || 0) + (headline?.comments_received || 0))}
            sub={`${headline?.posts_count || 0} posts · ${headline?.followers_count || 0} followers`}
            icon="💬"
            tone="pink"
            to="/app/feed"
          />
        </StaggerItem>
      </Stagger>

      {/* --------------------------------------------------- charts + skills */}
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15.5px] font-semibold tracking-tight">Weekly practice trend</h2>
              <p className="mt-0.5 text-[12.5px] text-3">Minutes logged per ISO week, last 8 weeks</p>
            </div>
            <Segmented
              options={[
                { id: 'minutes', label: 'Minutes' },
                { id: 'hours', label: 'Hours' },
              ]}
              value="minutes"
              onChange={() => {}}
            />
          </div>
          <AreaChart data={weekly} xKey="label" yKey="minutes" tone="violet" height={230} />
        </Card>

        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Where your time goes</h2>
          <p className="mt-0.5 text-[12.5px] text-3">Share of total practice by category</p>
          <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row">
            <DonutChart
              data={(charts?.distribution || []).map((d) => ({
                label: CATEGORY_MAP[d.category]?.label || d.category,
                value: d.minutes,
                accent: CATEGORY_MAP[d.category]?.accent || 'violet',
              }))}
              size={168}
              centerLabel="total"
              centerValue={humanMinutes(headline?.total_minutes || 0)}
            />
            <ul className="w-full flex-1 space-y-2">
              {(charts?.distribution || []).slice(0, 6).map((item) => {
                const category = CATEGORY_MAP[item.category]
                return (
                  <li key={item.category} className="flex items-center gap-2.5 text-[12.5px]">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-sm"
                      style={{ background: accent(category?.accent).hex }}
                    />
                    <span className="min-w-0 flex-1 truncate text-2">
                      {category?.icon} {category?.label || item.category}
                    </span>
                    <span className="shrink-0 tabular text-3">{item.percent}%</span>
                  </li>
                )
              })}
              {(charts?.distribution || []).length === 0 && (
                <li className="py-4 text-center text-[12.5px] text-3">Log a session to fill this in.</li>
              )}
            </ul>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        {/* skills */}
        <Card className="p-6">
          <div className="mb-5 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15.5px] font-semibold tracking-tight">Your skills</h2>
              <p className="mt-0.5 text-[12.5px] text-3">Progress toward this week's target</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/app/skills')}>
              View all
            </Button>
          </div>
          <div className="space-y-2.5">
            {(data?.top_skills || []).map((skill) => (
              <Link
                key={skill.id}
                to={`/app/skills/${skill.id}`}
                className="group flex items-center gap-3.5 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition hover:border-white/10 hover:bg-white/[0.05]"
              >
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[19px] ring-1 ring-white/10"
                  style={{ background: `${accent(skill.accent).hex}22` }}
                >
                  {skill.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13.5px] font-semibold">{skill.title}</span>
                    <span className="shrink-0 text-[11.5px] tabular text-3">
                      {humanMinutes(skill.total_minutes)} total
                    </span>
                  </div>
                  <div className="mt-2">
                    <Progress value={skill.progress_percent} tone={skill.accent} size="xs" />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-[11px] text-3">
                    <span>
                      {humanMinutes(skill.weekly_minutes)} / {humanMinutes(skill.goal_per_week)} this week
                    </span>
                    {skill.current_streak > 0 && (
                      <span className="flex items-center gap-1 text-amber-300">
                        🔥 {skill.current_streak}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
            {(data?.top_skills || []).length === 0 && (
              <EmptyState
                icon="🎯"
                title="No skills yet"
                message="Add the thing you want to get better at, and we will handle the tracking."
                action={
                  <Button variant="primary" onClick={() => navigate('/app/skills?new=1')}>
                    Create your first skill
                  </Button>
                }
              />
            )}
          </div>
        </Card>

        {/* activity */}
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15.5px] font-semibold tracking-tight">Recent activity</h2>
          </div>
          <Segmented
            className="mb-4"
            options={[
              { id: 'all', label: 'All' },
              { id: 'practice', label: 'Practice' },
              { id: 'post', label: 'Posts' },
              { id: 'milestone', label: 'Wins' },
            ]}
            value={activityFilter}
            onChange={setActivityFilter}
          />
          <div className="space-y-1">
            {activity.slice(0, 8).map((item, index) => (
              <div key={`${item.type}-${index}`} className="relative flex gap-3 pb-4 last:pb-0">
                {index < Math.min(activity.length, 8) - 1 && (
                  <span className="absolute left-[15px] top-8 h-full w-px bg-white/[0.07]" />
                )}
                <span
                  className="relative grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[14px] ring-1 ring-white/10"
                  style={{ background: `${accent(item.accent).hex}22` }}
                >
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="truncate text-[12.5px] font-medium">{item.title}</p>
                  {item.subtitle && <p className="mt-0.5 line-clamp-1 text-[11.5px] text-3">{item.subtitle}</p>}
                  <p className="mt-0.5 text-[11px] text-3">{timeAgo(item.timestamp)}</p>
                </div>
              </div>
            ))}
            {activity.length === 0 && (
              <p className="py-8 text-center text-[13px] text-3">Nothing here yet.</p>
            )}
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------ heatmap + goals */}
      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15.5px] font-semibold tracking-tight">Consistency</h2>
              <p className="mt-0.5 text-[12.5px] text-3">Every day you showed up, last 6 months</p>
            </div>
            <Tooltip content="Each square is a day. Darker = more practice.">
              <span className="cursor-help text-[13px] text-3">ⓘ</span>
            </Tooltip>
          </div>
          <Heatmap data={charts?.heatmap || []} tone="violet" weeks={26} />
        </Card>

        <Card className="p-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-[15.5px] font-semibold tracking-tight">Goals in flight</h2>
            <Button variant="quiet" size="sm" onClick={() => navigate('/app/goals')}>
              All goals
            </Button>
          </div>
          <div className="space-y-3">
            {(charts?.goal_progress || []).slice(0, 4).map((goal) => (
              <div key={goal.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold">{goal.title}</p>
                    <p className="mt-0.5 text-[11.5px] text-3">
                      {goal.current_value} / {goal.target_value} {goal.unit}
                    </p>
                  </div>
                  <Badge tone={goal.status === 'COMPLETED' ? 'emerald' : 'violet'} size="sm">
                    {percentLabel(goal.progress_percent)}%
                  </Badge>
                </div>
                <div className="mt-2.5">
                  <Progress value={goal.progress_percent} tone={goal.status === 'COMPLETED' ? 'emerald' : goal.skill_accent} size="sm" />
                </div>
                {goal.milestones?.length > 0 && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    {goal.milestones.map((milestone) => (
                      <Tooltip key={milestone.id} content={`${milestone.title}${milestone.achieved ? ' ✓' : ''}`}>
                        <span
                          className={`h-1.5 flex-1 rounded-full transition-colors ${
                            milestone.achieved ? 'bg-emerald-400' : 'bg-white/10'
                          }`}
                        />
                      </Tooltip>
                    ))}
                  </div>
                )}
              </div>
            ))}
            {(charts?.goal_progress || []).length === 0 && (
              <div className="py-6 text-center">
                <p className="text-[13px] text-3">No goals yet.</p>
                <Button variant="primary" size="sm" className="mt-3" onClick={() => navigate('/app/goals?new=1')}>
                  Set a goal
                </Button>
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* --------------------------------------------------------- badges */}
      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15.5px] font-semibold tracking-tight">Badges</h2>
            <p className="mt-0.5 text-[12.5px] text-3">
              {earnedBadges.length} of {badgeData?.items?.length || 0} unlocked
            </p>
          </div>
          <Progress
            value={badgeData?.items?.length ? (earnedBadges.length / badgeData.items.length) * 100 : 0}
            tone="amber"
            size="sm"
            className="w-40"
            showLabel
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          {[...earnedBadges, ...lockedBadges].map((badge) => (
            <Tooltip
              key={badge.code}
              content={`${badge.description}${badge.earned ? '' : ` · needs ${badge.threshold} on ${badge.metric}`}`}
            >
              <div
                className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition ${
                  badge.earned
                    ? 'border-amber-300/25 bg-amber-400/[0.07]'
                    : 'border-white/5 bg-white/[0.02] opacity-45 grayscale'
                }`}
              >
                <span className="text-[19px]">{badge.icon}</span>
                <div>
                  <div className="text-[12.5px] font-semibold leading-tight">{badge.title}</div>
                  <div className="text-[10.5px] text-3">
                    {badge.earned ? 'Unlocked' : `${badge.threshold} ${badge.metric}`}
                  </div>
                </div>
              </div>
            </Tooltip>
          ))}
        </div>
      </Card>

      <LogPracticeModal
        open={logOpen}
        onClose={closeLog}
        onLogged={afterLog}
        defaultSkillId={searchParams.get('skill')}
      />
    </Page>
  )
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="skeleton h-64 rounded-2xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-36 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
        <div className="skeleton h-80 rounded-2xl" />
        <div className="skeleton h-80 rounded-2xl" />
      </div>
    </div>
  )
}
