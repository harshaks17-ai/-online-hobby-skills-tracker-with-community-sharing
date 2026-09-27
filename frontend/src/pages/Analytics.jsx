import { useMemo } from 'react'
import { useToast } from '../context/ToastContext'
import { analyticsApi } from '../lib/api'
import { useAsync, useStoredState } from '../lib/hooks'
import { compactNumber, humanMinutes, monthDay, weekday } from '../lib/format'
import { CATEGORY_MAP, LEVELS, STATUS_TONE, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import { AreaChart, BarChart, DayBars, DonutChart, Heatmap, HourHistogram, StackedBar } from '../components/charts'
import {
  Badge, Button, Card, EmptyState, Progress, RadialProgress, Segmented, Tooltip,
} from '../components/ui'

const HEATMAP_RANGES = [
  { id: 13, label: '3 months' },
  { id: 26, label: '6 months' },
  { id: 52, label: '1 year' },
]

export default function Analytics() {
  const toast = useToast()
  const [heatmapWeeks, setHeatmapWeeks] = useStoredState('analytics.weeks', 26)
  const [metric, setMetric] = useStoredState('analytics.metric', 'minutes')

  const { data, loading, refetch } = useAsync(() => analyticsApi.dashboard(), [])
  const { data: badgeData } = useAsync(() => analyticsApi.badges(), [])
  const { data: levelData } = useAsync(() => analyticsApi.levels(), [])
  const levelCounts = levelData?.items || []

  const exportData = async () => {
    try {
      const payload = await analyticsApi.exportData()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `hobbylog-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Your data has been exported.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const headline = data?.headline || {}
  const charts = data?.charts || {}
  const weekly = charts.weekly_trend || []
  const daily = charts.daily_30 || []
  const bySkill = charts.by_skill || []
  const distribution = charts.distribution || []
  const goals = charts.goal_progress || []
  const streak = data?.stats || {}

  const totalHours = headline.total_hours || 0
  const weeklySeries = useMemo(
    () => weekly.map((w) => ({ ...w, value: metric === 'hours' ? w.hours : w.minutes })),
    [weekly, metric],
  )

  const bestDay = useMemo(() => {
    if (!daily.length) return null
    return daily.reduce((best, day) => (day.minutes > (best?.minutes ?? -1) ? day : best), null)
  }, [daily])

  const peakHour = useMemo(() => {
    const buckets = charts.activity_by_hour || []
    if (!buckets.length) return null
    return buckets.reduce((best, b) => (b.sessions > (best?.sessions ?? -1) ? b : best), null)
  }, [charts.activity_by_hour])

  if (loading) return <AnalyticsSkeleton />

  const earned = (badgeData?.items || []).filter((b) => b.earned)
  const locked = (badgeData?.items || []).filter((b) => !b.earned)

  return (
    <Page className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Analytics</h1>
          <p className="mt-1 text-[13.5px] text-3">
            Every number here is derived from your immutable session log.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <Segmented
            options={[
              { id: 'minutes', label: 'Minutes' },
              { id: 'hours', label: 'Hours' },
            ]}
            value={metric}
            onChange={setMetric}
          />
          <Button variant="ghost" onClick={() => refetch()}>
            Refresh
          </Button>
          <Button variant="ghost" onClick={exportData}>
            ⬇ Export data
          </Button>
        </div>
      </div>

      {/* KPI row */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'Lifetime practice',
            value: `${totalHours.toFixed(1)}h`,
            sub: `${compactNumber(headline.total_sessions || 0)} sessions · ${compactNumber(streak.active_days || 0)} active days`,
            icon: '⏱️',
            tone: 'violet',
          },
          {
            label: 'Current streak',
            value: `${headline.current_streak || 0} days`,
            sub: `Longest run: ${headline.longest_streak || 0} days`,
            icon: '🔥',
            tone: 'amber',
          },
          {
            label: 'Weekly target',
            value: `${Math.round(headline.weekly_progress_percent || 0)}%`,
            sub: `${humanMinutes(headline.weekly_minutes)} of ${humanMinutes(headline.weekly_target_minutes)}`,
            icon: '🎯',
            tone: 'emerald',
          },
          {
            label: 'Goals completed',
            value: headline.goals_completed || 0,
            sub: `${headline.milestones_achieved || 0} milestones · ${headline.goals_active || 0} in flight`,
            icon: '🏁',
            tone: 'sky',
          },
        ].map((item) => (
          <StaggerItem key={item.label}>
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-3">{item.label}</p>
                  <p className="mt-2 font-display text-[26px] font-bold leading-none tabular">{item.value}</p>
                  <p className="mt-1.5 truncate text-[12px] text-3">{item.sub}</p>
                </div>
                <span
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px] ring-1 ring-white/10"
                  style={{ background: `${accent(item.tone).hex}22` }}
                >
                  {item.icon}
                </span>
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      {/* weekly trend + donut */}
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <Card className="p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15.5px] font-semibold tracking-tight">Weekly trend</h2>
              <p className="mt-0.5 text-[12.5px] text-3">Last 8 ISO weeks</p>
            </div>
            <div className="text-right">
              <div className="text-[11px] uppercase tracking-wider text-3">Average / week</div>
              <div className="text-[15px] font-bold tabular">
                {humanMinutes(Math.round((headline.total_minutes || 0) / Math.max(1, weekly.length)))}
              </div>
            </div>
          </div>
          <AreaChart
            data={weeklySeries}
            xKey="label"
            yKey="value"
            tone="violet"
            height={250}
            formatValue={(v) => (metric === 'hours' ? `${v.toFixed(1)}h` : humanMinutes(v))}
            formatTick={metric === 'hours' ? (v) => v.toFixed(0) : compactNumber}
          />
        </Card>

        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Category split</h2>
          <p className="mt-0.5 text-[12.5px] text-3">Share of your total practice time</p>
          <div className="mt-5 flex flex-col items-center gap-5">
            <DonutChart
              data={distribution.map((d) => ({
                label: CATEGORY_MAP[d.category]?.label || d.category,
                value: d.minutes,
                accent: CATEGORY_MAP[d.category]?.accent || 'violet',
              }))}
              size={172}
              centerLabel="total"
              centerValue={`${totalHours.toFixed(1)}h`}
            />
            <div className="w-full space-y-2">
              {distribution.map((item) => (
                <div key={item.category} className="flex items-center gap-2.5 text-[12.5px]">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ background: accent(CATEGORY_MAP[item.category]?.accent).hex }}
                  />
                  <span className="min-w-0 flex-1 truncate text-2">
                    {CATEGORY_MAP[item.category]?.icon} {CATEGORY_MAP[item.category]?.label || item.category}
                  </span>
                  <span className="shrink-0 tabular text-3">{item.percent}%</span>
                  <span className="w-14 shrink-0 text-right tabular text-2">{humanMinutes(item.minutes)}</span>
                </div>
              ))}
              {distribution.length === 0 && (
                <p className="py-4 text-center text-[12.5px] text-3">No sessions recorded yet.</p>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* by skill */}
      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">Practice by skill</h2>
        <p className="mt-0.5 mb-5 text-[12.5px] text-3">Total time and session count per skill</p>
        {bySkill.length === 0 ? (
          <EmptyState icon="📊" title="Nothing to chart yet" message="Log a practice session to populate this view." />
        ) : (
          <div className="grid gap-6 lg:grid-cols-2">
            <BarChart
              data={bySkill.map((s) => ({ label: s.title, value: s.minutes, accent: s.accent, icon: s.icon }))}
              yKey="value"
              horizontal
              formatValue={humanMinutes}
            />
            <div className="space-y-2.5">
              {bySkill.map((skill) => {
                const total = bySkill.reduce((sum, s) => sum + s.minutes, 0) || 1
                return (
                  <div key={skill.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span className="text-[16px]">{skill.icon}</span>
                        <span className="truncate text-[13px] font-semibold">{skill.title}</span>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="text-[13px] font-bold tabular">{humanMinutes(skill.minutes)}</div>
                        <div className="text-[10.5px] text-3">{skill.sessions} sessions</div>
                      </div>
                    </div>
                    <div className="mt-2.5">
                      <StackedBar
                        segments={[{ label: skill.title, value: skill.minutes, accent: skill.accent }]}
                        height={6}
                      />
                    </div>
                    <div className="mt-1.5 text-right text-[10.5px] text-3">
                      {Math.round((skill.minutes / total) * 100)}% of your time
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </Card>

      {/* heatmap + hour histogram */}
      <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr]">
        <Card className="p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-[15.5px] font-semibold tracking-tight">Consistency heatmap</h2>
              <p className="mt-0.5 text-[12.5px] text-3">
                {streak.active_days || 0} active days logged all-time
              </p>
            </div>
            <Segmented options={HEATMAP_RANGES} value={heatmapWeeks} onChange={setHeatmapWeeks} />
          </div>
          {charts.heatmap?.length ? (
            <Heatmap data={charts.heatmap} tone="violet" weeks={heatmapWeeks} />
          ) : (
            <div className="skeleton h-32" />
          )}
        </Card>

        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">When you practise</h2>
          <p className="mt-0.5 mb-4 text-[12.5px] text-3">
            {peakHour ? `Busiest around ${String(peakHour.hour).padStart(2, '0')}:00` : 'No data yet'}
          </p>
          {charts.activity_by_hour?.length ? (
            <HourHistogram data={charts.activity_by_hour} tone="cyan" height={140} />
          ) : (
            <div className="skeleton h-[140px]" />
          )}
          {bestDay?.minutes > 0 && (
            <div className="mt-4 rounded-xl border border-white/5 bg-white/[0.02] p-3.5">
              <p className="text-[11px] uppercase tracking-wider text-3">Personal best day</p>
              <p className="mt-1 text-[15px] font-bold">
                {humanMinutes(bestDay.minutes)}{' '}
                <span className="text-[12px] font-normal text-3">
                  on {weekday(bestDay.date)} {monthDay(bestDay.date)}
                </span>
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* last 30 days */}
      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">Last 30 days</h2>
        <p className="mt-0.5 mb-4 text-[12.5px] text-3">
          {humanMinutes(daily.reduce((sum, d) => sum + d.minutes, 0))} across{' '}
          {daily.filter((d) => d.minutes > 0).length} active days
        </p>
        <DayBars data={daily} tone="cyan" height={130} />
      </Card>

      {/* goals */}
      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">Goal progress</h2>
        <p className="mt-0.5 text-[12.5px] text-3">Where every goal stands right now</p>
        {goals.length === 0 ? (
          <EmptyState icon="🎯" title="No goals set" message="Create a goal and its progress will appear here." />
        ) : (
          <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-2">
            {goals.map((goal) => (
              <div key={goal.id} className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {goal.skill_icon && <span>{goal.skill_icon}</span>}
                      <span className="truncate text-[13.5px] font-semibold">{goal.title}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] text-3">
                      {goal.current_value} / {goal.target_value} {goal.unit}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONE[goal.status] || 'violet'} size="sm" dot>
                    {goal.status}
                  </Badge>
                </div>
                <div className="mt-3">
                  <Progress
                    value={goal.progress_percent}
                    tone={goal.status === 'COMPLETED' ? 'emerald' : goal.skill_accent}
                    size="sm"
                    showLabel
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* badges + levels */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Badge collection</h2>
          <p className="mt-0.5 text-[12.5px] text-3">
            {earned.length} of {(badgeData?.items || []).length} unlocked
          </p>
          <div className="mt-5 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            {[...earned, ...locked].map((badge) => (
              <Tooltip
                key={badge.code}
                content={`${badge.description}${badge.earned ? '' : ` · unlock at ${badge.threshold} ${badge.metric}`}`}
              >
                <div
                  className={`flex flex-col items-center gap-1.5 rounded-xl border p-3 text-center transition ${
                    badge.earned
                      ? 'border-amber-300/25 bg-amber-400/[0.07]'
                      : 'border-white/5 bg-white/[0.02] opacity-40 grayscale'
                  }`}
                >
                  <span className="text-[22px]">{badge.icon}</span>
                  <span className="text-[11.5px] font-semibold leading-tight">{badge.title}</span>
                  <span className="text-[9.5px] uppercase tracking-wider text-3">{badge.tier}</span>
                </div>
              </Tooltip>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Level distribution</h2>
          <p className="mt-0.5 text-[12.5px] text-3">Levels are derived from logged hours</p>
          <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
            <RadialProgress
              value={headline.weekly_progress_percent || 0}
              size={140}
              stroke={12}
              tone="emerald"
              label="this week"
            />
            <div className="w-full flex-1 space-y-3.5">
              {LEVELS.map((level) => {
                const count =
                  levelCounts.find((entry) => entry.level === level.id)?.count ?? 0
                const share = headline.total_skills ? (count / headline.total_skills) * 100 : 0
                return (
                  <div key={level.id}>
                    <div className="mb-1.5 flex items-center justify-between text-[12.5px]">
                      <span className="flex items-center gap-2 text-2">
                        <span
                          className="h-2.5 w-2.5 rounded-sm"
                          style={{
                            background: accent(
                              level.id === 'ADVANCED' ? 'emerald' : level.id === 'INTERMEDIATE' ? 'sky' : 'slate',
                            ).hex,
                          }}
                        />
                        {level.label}
                        <span className="text-[10.5px] text-3">{level.hint}</span>
                      </span>
                      <span className="tabular font-semibold">
                        {count} <span className="text-[10.5px] font-normal text-3">({Math.round(share)}%)</span>
                      </span>
                    </div>
                    <Progress
                      value={share}
                      size="xs"
                      tone={level.id === 'ADVANCED' ? 'emerald' : level.id === 'INTERMEDIATE' ? 'sky' : 'slate'}
                    />
                  </div>
                )
              })}
              <p className="pt-1 text-[12px] leading-relaxed text-3">
                Skills are promoted automatically once you pass 10 hours (Intermediate) and 40 hours
                (Advanced). A level never regresses, so quitting for a month does not erase progress.
              </p>
            </div>
          </div>
        </Card>
      </div>
    </Page>
  )
}

function AnalyticsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton h-32 rounded-2xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1.7fr_1fr]">
        <div className="skeleton h-80 rounded-2xl" />
        <div className="skeleton h-80 rounded-2xl" />
      </div>
      <div className="skeleton h-72 rounded-2xl" />
    </div>
  )
}
