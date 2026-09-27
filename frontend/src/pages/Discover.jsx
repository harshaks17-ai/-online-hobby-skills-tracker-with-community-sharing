import { useMemo, useState } from 'react'
import { skillsApi } from '../lib/api'
import { useAsync, useDebounced } from '../lib/hooks'
import { hours, humanMinutes } from '../lib/format'
import { CATEGORIES, CATEGORY_MAP, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import { Badge, Card, Collapse, EmptyState, Input, PillGroup, Skeleton } from '../components/ui'

const CATEGORY_FILTERS = [{ id: 'all', label: 'All' }, ...CATEGORIES]

const BADGE_TONE = {
  violet: 'violet', indigo: 'violet', purple: 'violet', fuchsia: 'pink', pink: 'pink',
  sky: 'sky', cyan: 'sky', blue: 'sky', emerald: 'emerald', teal: 'emerald', lime: 'emerald',
  amber: 'amber', orange: 'amber', rose: 'rose', slate: 'slate',
}

export default function Discover() {
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const debouncedSearch = useDebounced(search, 400)

  const { data, loading } = useAsync(
    () =>
      skillsApi.discover({
        search: debouncedSearch || undefined,
        category: category === 'all' ? undefined : category,
        limit: 48,
      }),
    [debouncedSearch, category],
  )

  const skills = data?.items || []

  const summary = useMemo(() => {
    const minutes = skills.reduce((sum, skill) => sum + (Number(skill.total_minutes) || 0), 0)
    return { count: skills.length, minutes, hours: hours(minutes) }
  }, [skills])

  return (
    <Page className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">Discover skills</h1>
        <p className="mt-1 text-[13.5px] text-3">
          Public skills the community is practising right now — borrow an idea and make it yours.
        </p>
      </div>

      <div className="surface-2 grid gap-3 rounded-2xl p-4 sm:grid-cols-3">
        {[
          { label: 'Skills found', value: summary.count, icon: '🧭', tone: 'violet' },
          { label: 'Hours in view', value: `${summary.hours}h`, icon: '⏳', tone: 'sky' },
          { label: 'Minutes in view', value: humanMinutes(summary.minutes), icon: '📊', tone: 'emerald' },
        ].map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px] ring-1 ring-white/10"
              style={{ background: `${accent(item.tone).hex}22` }}
            >
              {item.icon}
            </span>
            <div className="min-w-0">
              <p className="truncate text-[10.5px] uppercase tracking-wider text-3">{item.label}</p>
              <p className="text-[18px] font-bold tabular">{item.value}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative">
        <Input
          placeholder="Search public skills…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 sm:w-80"
          aria-label="Search public skills"
        />
        <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-3">⌕</span>
      </div>

      <PillGroup items={CATEGORY_FILTERS} value={category} onChange={setCategory} />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-56 rounded-2xl" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <Card>
          <EmptyState
            icon="🔭"
            title={debouncedSearch ? `Nothing matches “${debouncedSearch}”` : 'No public skills yet'}
            message="Once someone makes a skill public it shows up here, ordered by the hours they have put into it. Be the first — or widen your search."
            action={
              (debouncedSearch || category !== 'all') && (
                <button
                  type="button"
                  onClick={() => {
                    setSearch('')
                    setCategory('all')
                  }}
                  className="btn-ghost"
                >
                  Clear filters
                </button>
              )
            }
          />
        </Card>
      ) : (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <StaggerItem key={skill.id}>
              <DiscoverCard skill={skill} />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {!loading && skills.length > 0 && (
        <p className="text-center text-[12.5px] text-3">
          Showing {skills.length} public skill{skills.length === 1 ? '' : 's'}. Make one of them public from
          Skills to grow this list.
        </p>
      )}
    </Page>
  )
}

/* --------------------------------------------------------- discover card */
function DiscoverCard({ skill }) {
  const [open, setOpen] = useState(false)
  const category = CATEGORY_MAP[skill.category]
  const minutes = Number(skill.total_minutes) || 0

  return (
    <div className="h-full rounded-2xl bg-gradient-to-b from-white/[0.12] to-transparent p-px transition hover:from-white/20">
      <Card className="h-full overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          className="flex h-full w-full flex-col items-start gap-3 p-5 text-left"
        >
          <div className="flex w-full items-start gap-3">
            <span
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[20px] ring-1 ring-white/10"
              style={{ background: `${accent(skill.accent).hex}22` }}
            >
              {skill.icon || category?.icon || '✨'}
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[14.5px] font-semibold tracking-tight">{skill.title}</h3>
              <p className="mt-0.5 truncate text-[12px] text-3">
                {skill.owner_name || 'Someone'}
                {skill.owner_username ? ` · @${skill.owner_username}` : ''}
              </p>
            </div>
            {category && (
              <Badge tone={BADGE_TONE[category.accent] || 'slate'} size="sm">
                {category.icon} {category.label}
              </Badge>
            )}
          </div>

          <p className="line-clamp-2 text-[12.5px] leading-relaxed text-3">
            {skill.description || 'No description yet — the owner is still writing one.'}
          </p>

          <div className="mt-auto flex w-full items-center justify-between gap-3 border-t border-white/5 pt-3 text-[11.5px] text-3">
            <span className="font-semibold tabular text-1">{humanMinutes(minutes)}</span>
            <span className="tabular">{hours(minutes)}h in total</span>
          </div>

          <Collapse open={open} className="w-full">
            <div className="w-full space-y-2.5 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 text-[12.5px] leading-relaxed text-2">
              <p className="whitespace-pre-wrap">{skill.description || 'No description yet.'}</p>
              <div className="flex items-center gap-2.5 border-t border-white/5 pt-2.5 text-[11.5px] text-3">
                <span
                  className="grid h-7 w-7 shrink-0 place-items-center overflow-hidden rounded-full text-[11px] font-bold"
                  style={{ background: `${accent(skill.accent).hex}33` }}
                >
                  {skill.owner_avatar ? (
                    <img
                      src={skill.owner_avatar}
                      alt={skill.owner_name || 'Skill owner'}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (skill.owner_name || '?').slice(0, 1).toUpperCase()
                  )}
                </span>
                <span className="truncate">
                  Practised by{' '}
                  <span className="font-semibold text-1">{skill.owner_name || 'someone'}</span>
                  {skill.owner_username ? ` (@${skill.owner_username})` : ''} · {humanMinutes(minutes)} total
                </span>
              </div>
            </div>
          </Collapse>

          <span className="text-[11px] font-semibold text-3">{open ? 'Hide details' : 'Show details'}</span>
        </button>
      </Card>
    </div>
  )
}
