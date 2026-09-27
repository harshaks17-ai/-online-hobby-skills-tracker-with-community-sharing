import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useToast } from '../context/ToastContext'
import { analyticsApi, skillsApi } from '../lib/api'
import { useAsync, useDebounced, useStoredState } from '../lib/hooks'
import { humanMinutes, isoDateOffset } from '../lib/format'
import { CATEGORIES, LEVELS, SKILL_ICONS, SKILL_STATUSES, STATUS_TONE, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import { BarChart } from '../components/charts'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PillGroup,
  Progress, Select, Textarea,
} from '../components/ui'

const EMPTY_FORM = {
  title: '',
  category: 'music',
  description: '',
  icon: '🎸',
  accent: 'violet',
  current_level: 'BEGINNER',
  target_level: 'INTERMEDIATE',
  goal_per_week: 180,
  minutes_per_session: 30,
  target_date: isoDateOffset(90),
  status: 'ACTIVE',
}

const ACCENT_CHOICES = ['violet', 'sky', 'emerald', 'amber', 'rose', 'pink', 'cyan', 'fuchsia', 'orange', 'lime']

export default function Skills() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [statusFilter, setStatusFilter] = useStoredState('skills.status', 'ALL')
  const [view, setView] = useStoredState('skills.view', 'grid')
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 300)

  const { data, loading, refetch } = useAsync(
    () => skillsApi.list({ status: statusFilter === 'ALL' ? undefined : statusFilter }),
    [statusFilter],
  )
  const { data: analytics } = useAsync(() => analyticsApi.dashboard(), [])

  const skills = useMemo(() => {
    const items = data?.items || []
    if (!debouncedSearch.trim()) return items
    const term = debouncedSearch.trim().toLowerCase()
    return items.filter(
      (s) => s.title.toLowerCase().includes(term) || s.description.toLowerCase().includes(term),
    )
  }, [data, debouncedSearch])

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    if (searchParams.get('new')) {
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const openEdit = (skill) => {
    setEditing(skill)
    setFormOpen(true)
  }

  const remove = async () => {
    try {
      await skillsApi.remove(deleting.id)
      toast.success(`Deleted “${deleting.title}” and its history.`)
      setDeleting(null)
      refetch()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const bySkill = analytics?.charts?.by_skill || []

  return (
    <Page className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight">My skills</h1>
          <p className="mt-1 text-[13.5px] text-3">
            {loading ? 'Loading…' : `${data?.total || 0} tracked · ${humanMinutes(data?.total_minutes || 0)} logged`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative">
            <Input
              placeholder="Search skills…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-48 pl-9"
              aria-label="Search my skills"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-3">⌕</span>
          </div>
          <Button variant="primary" id="newSkill" onClick={() => setFormOpen(true)}>
            <span className="text-base leading-none">+</span> Create Hobby
          </Button>
        </div>
      </div>

      {/* summary strip */}
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total skills', value: data?.total ?? 0, icon: '🎯', tone: 'violet' },
          { label: 'Active', value: data?.active ?? 0, icon: '⚡', tone: 'emerald' },
          { label: 'Hours logged', value: (data?.total_hours ?? 0).toFixed(1), icon: '⏱️', tone: 'sky' },
          {
            label: 'Most practised',
            value: bySkill[0]?.title?.slice(0, 14) || '—',
            icon: bySkill[0]?.icon || '📊',
            tone: bySkill[0]?.accent || 'amber',
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
              <p className="truncate text-[15px] font-bold tabular">{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <PillGroup
          items={[{ id: 'ALL', label: 'All' }, ...SKILL_STATUSES.map((s) => ({ id: s.id, label: s.label }))]}
          value={statusFilter}
          onChange={setStatusFilter}
        />
        <div className="flex rounded-xl bg-[rgb(var(--surface-1))] p-1 ring-1 ring-white/5">
          {['grid', 'list'].map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition ${
                view === mode ? 'bg-brand-gradient text-white' : 'text-3 hover:text-1'
              }`}
              aria-label={`${mode} view`}
            >
              {mode === 'grid' ? '▦' : '☰'}
            </button>
          ))}
        </div>
      </div>

      {bySkill.length > 0 && (
        <Card className="p-6">
          <h2 className="text-[15px] font-semibold tracking-tight">Time by skill</h2>
          <p className="mt-0.5 mb-4 text-[12.5px] text-3">Total minutes logged, all skills</p>
          <BarChart
            data={bySkill.map((s) => ({ label: s.title, value: s.minutes, accent: s.accent, icon: s.icon }))}
            yKey="value"
            horizontal
            formatValue={humanMinutes}
          />
        </Card>
      )}

      {loading ? (
        <div className={view === 'grid' ? 'grid gap-4 sm:grid-cols-2 xl:grid-cols-3' : 'space-y-3'}>
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="skeleton h-52 rounded-2xl" />
          ))}
        </div>
      ) : skills.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎯"
            title={search ? `Nothing matches “${search}”` : 'No skills here yet'}
            message={
              search
                ? 'Try a different search term, or clear the status filter.'
                : 'A skill is anything you want to get better at — guitar, running, Python, sourdough.'
            }
            action={
              <Button variant="primary" onClick={() => setFormOpen(true)}>
                Create your first skill
              </Button>
            }
          />
        </Card>
      ) : view === 'grid' ? (
        <Stagger className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {skills.map((skill) => (
            <StaggerItem key={skill.id}>
              <SkillCard skill={skill} onEdit={openEdit} onDelete={setDeleting} />
            </StaggerItem>
          ))}
        </Stagger>
      ) : (
        <div className="space-y-2.5">
          {skills.map((skill) => (
            <SkillRow key={skill.id} skill={skill} onEdit={openEdit} onDelete={setDeleting} />
          ))}
        </div>
      )}

      <SkillForm
        open={formOpen}
        skill={editing}
        onClose={closeForm}
        onSaved={() => {
          closeForm()
          refetch()
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this skill?"
        message={`“${deleting?.title}” and all of its practice sessions, goals and milestones will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete skill"
      />
    </Page>
  )
}

/* -------------------------------------------------------------- skill card */
function SkillCard({ skill, onEdit, onDelete }) {
  const tone = STATUS_TONE[skill.status] || 'violet'
  const weeklyPct = Math.min(100, skill.progress_percent)
  return (
    <Card hover className="group relative h-full overflow-hidden p-5">
      <div
        className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full opacity-40 blur-3xl transition-opacity duration-500 group-hover:opacity-80"
        style={{ background: accent(skill.accent).glow }}
      />
      <div className="relative">
        <div className="flex items-start gap-3">
          <span
            className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-[24px] ring-1 ring-white/10"
            style={{ background: `${accent(skill.accent).hex}22` }}
          >
            {skill.icon}
          </span>
          <div className="min-w-0 flex-1">
            <Link
              to={`/app/skills/${skill.id}`}
              className="block truncate text-[15.5px] font-semibold tracking-tight hover:text-brand-300"
            >
              {skill.title}
            </Link>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <Badge tone={tone} size="sm" dot>
                {skill.status}
              </Badge>
              <Badge size="sm" tone="slate">
                {skill.current_level}
              </Badge>
            </div>
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 transition-opacity group-hover:opacity-100">
            <Button variant="quiet" size="icon-sm" onClick={() => onEdit(skill)} aria-label={`Edit ${skill.title}`}>
              ✎
            </Button>
            <Button variant="quiet" size="icon-sm" onClick={() => onDelete(skill)} aria-label={`Delete ${skill.title}`}>
              🗑
            </Button>
          </div>
        </div>

        {skill.description && (
          <p className="mt-3.5 line-clamp-2 text-[12.5px] leading-relaxed text-3">{skill.description}</p>
        )}

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between text-[11.5px]">
            <span className="text-3">This week</span>
            <span className="tabular font-semibold text-2">
              {humanMinutes(skill.weekly_minutes)} / {humanMinutes(skill.goal_per_week)}
            </span>
          </div>
          <Progress value={weeklyPct} tone={skill.accent} size="sm" />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-white/5 pt-3.5 text-center">
          <div>
            <div className="text-[15px] font-bold tabular">{humanMinutes(skill.total_minutes)}</div>
            <div className="text-[10.5px] text-3">Total</div>
          </div>
          <div>
            <div className="text-[15px] font-bold tabular">{skill.session_count}</div>
            <div className="text-[10.5px] text-3">Sessions</div>
          </div>
          <div>
            <div className="text-[15px] font-bold tabular text-amber-300">
              {skill.current_streak > 0 ? `🔥 ${skill.current_streak}` : '—'}
            </div>
            <div className="text-[10.5px] text-3">Streak</div>
          </div>
        </div>
      </div>
    </Card>
  )
}

function SkillRow({ skill, onEdit, onDelete }) {
  return (
    <Card className="group flex flex-wrap items-center gap-4 p-4 transition hover:border-white/10 sm:flex-nowrap">
      <span
        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[21px] ring-1 ring-white/10"
        style={{ background: `${accent(skill.accent).hex}22` }}
      >
        {skill.icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <Link to={`/app/skills/${skill.id}`} className="truncate text-[14px] font-semibold hover:text-brand-300">
            {skill.title}
          </Link>
          <Badge tone={STATUS_TONE[skill.status]} size="sm" dot>
            {skill.status}
          </Badge>
        </div>
        <div className="mt-0.5 truncate text-[12px] text-3">
          {skill.session_count} sessions · {humanMinutes(skill.total_minutes)} · {skill.category}
        </div>
      </div>
      <div className="w-full sm:w-44">
        <Progress value={skill.progress_percent} tone={skill.accent} size="xs" showLabel />
      </div>
      <div className="flex shrink-0 gap-1">
        <Button variant="quiet" size="icon-sm" onClick={() => onEdit(skill)} aria-label="Edit">
          ✎
        </Button>
        <Button variant="quiet" size="icon-sm" onClick={() => onDelete(skill)} aria-label="Delete">
          🗑
        </Button>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------- skill form */
function SkillForm({ open, skill, onClose, onSaved }) {
  const toast = useToast()
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const isEdit = Boolean(skill)

  useEffect(() => {
    if (!open) return
    setError('')
    setForm(
      skill
        ? {
            title: skill.title,
            category: skill.category,
            description: skill.description || '',
            icon: skill.icon,
            accent: skill.accent,
            current_level: skill.current_level,
            target_level: skill.target_level,
            goal_per_week: skill.goal_per_week,
            minutes_per_session: skill.minutes_per_session,
            target_date: skill.target_date || isoDateOffset(90),
            status: skill.status,
          }
        : EMPTY_FORM,
    )
  }, [open, skill])

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))
  const weeklyHours = (form.goal_per_week / 60).toFixed(1)

  const submit = async (event) => {
    event.preventDefault()
    if (form.title.trim().length < 2) {
      setError('Give your skill a name of at least 2 characters.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const payload = {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
        icon: form.icon,
        accent: form.accent,
        current_level: form.current_level,
        target_level: form.target_level,
        goal_per_week: Number(form.goal_per_week),
        minutes_per_session: Number(form.minutes_per_session),
        target_date: form.target_date || null,
      }
      if (isEdit) {
        await skillsApi.update(skill.id, { ...payload, status: form.status })
        toast.success(`Updated “${payload.title}”.`)
      } else {
        await skillsApi.create(payload)
        toast.celebrate(`${form.icon} “${payload.title}” added. Go log your first session!`)
      }
      onSaved()
    } catch (err) {
      setError(err.message)
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit skill' : 'Create a skill'}
      subtitle={
        isEdit ? 'Changes apply to future sessions only.' : 'A skill is anything you want to get better at.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="skill-form" id="saveHobby" loading={saving}>
            {isEdit ? 'Save changes' : 'Create skill'}
          </Button>
        </>
      }
    >
      <form id="skill-form" onSubmit={submit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_110px]">
          <Field label="Skill name" htmlFor="title" required>
            <Input
              id="title"
              placeholder="Guitar, Morning runs, Spanish, Sourdough…"
              value={form.title}
              onChange={set('title')}
              maxLength={120}
              required
            />
          </Field>
          <Field label="Icon" htmlFor="skill-icon">
            <Select id="skill-icon" value={form.icon} onChange={set('icon')}>
              {SKILL_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <Select id="category" value={form.category} onChange={set('category')}>
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Accent colour" hint="Used across your dashboard">
            <div className="flex flex-wrap gap-1.5 pt-1">
              {ACCENT_CHOICES.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, accent: option }))}
                  aria-label={`Use the ${option} accent`}
                  className={`h-7 w-7 rounded-lg transition-all ${
                    form.accent === option ? 'scale-110 ring-2 ring-white/70' : 'opacity-60 hover:opacity-100'
                  }`}
                  style={{ background: accent(option).hex }}
                />
              ))}
            </div>
          </Field>
        </div>

        <Field label="Description" htmlFor="description" hint="What are you working towards?">
          <Textarea
            id="description"
            rows={3}
            placeholder="Fingerstyle and chord progressions. Working toward a clean three-song set."
            value={form.description}
            onChange={set('description')}
            maxLength={2000}
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Current level" htmlFor="current_level">
            <Select id="current_level" value={form.current_level} onChange={set('current_level')}>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Target level" htmlFor="target_level">
            <Select id="target_level" value={form.target_level} onChange={set('target_level')}>
              {LEVELS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </Field>
          {isEdit && (
            <Field label="Status" htmlFor="status">
              <Select id="status" value={form.status} onChange={set('status')}>
                {SKILL_STATUSES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}
        </div>

        <div className="surface-2 grid gap-4 rounded-2xl p-4 sm:grid-cols-2">
          <Field
            label="Weekly goal (minutes)"
            htmlFor="goalPerWeek"
            hint={`≈ ${weeklyHours} hours per week`}
          >
            <Input
              id="goalPerWeek"
              type="number"
              min="0"
              max="10080"
              step="15"
              value={form.goal_per_week}
              onChange={set('goal_per_week')}
            />
            <input
              type="range"
              min="0"
              max="900"
              step="15"
              value={form.goal_per_week}
              onChange={set('goal_per_week')}
              aria-label="Weekly goal in minutes"
              className="mt-3 w-full accent-[#8b74ff]"
            />
          </Field>
          <div className="space-y-4">
            <Field label="Typical session (minutes)" htmlFor="minutes_per_session">
              <Input
                id="minutes_per_session"
                type="number"
                min="5"
                max="1440"
                step="5"
                value={form.minutes_per_session}
                onChange={set('minutes_per_session')}
              />
            </Field>
            <Field label="Target date" htmlFor="target_date">
              <Input id="target_date" type="date" value={form.target_date || ''} onChange={set('target_date')} />
            </Field>
          </div>
        </div>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-200">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}
