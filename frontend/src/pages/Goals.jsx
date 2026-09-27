import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useToast } from '../context/ToastContext'
import { goalsApi, skillsApi } from '../lib/api'
import { useAsync, useStoredState } from '../lib/hooks'
import { isoDateOffset, longDate, percentLabel, relativeDay } from '../lib/format'
import { GOAL_UNITS, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PillGroup,
  Progress, Select, Textarea,
} from '../components/ui'

const STATUS_FILTERS = [
  { id: 'ALL', label: 'All' },
  { id: 'ACTIVE', label: 'Active' },
  { id: 'COMPLETED', label: 'Completed' },
  { id: 'PAUSED', label: 'Paused' },
]

const MILESTONE_STEPS = [0.25, 0.5, 0.75, 1]

export default function Goals() {
  const toast = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [formOpen, setFormOpen] = useState(searchParams.get('new') === '1')
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [status, setStatus] = useStoredState('goals.status', 'ALL')

  const { data, loading, refetch } = useAsync(
    () => goalsApi.list({ status: status === 'ALL' ? undefined : status }),
    [status],
  )
  const { data: skillsData } = useAsync(() => skillsApi.list(), [])
  const { data: achievements } = useAsync(() => goalsApi.achievements(), [])

  const goals = data?.items || []
  const summary = data?.summary || {}

  const closeForm = () => {
    setFormOpen(false)
    setEditing(null)
    if (searchParams.get('new')) {
      searchParams.delete('new')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const remove = async () => {
    try {
      await goalsApi.remove(deleting.id)
      toast.success('Goal deleted.')
      setDeleting(null)
      refetch()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const rebuild = async (goal) => {
    try {
      await goalsApi.rebuild(goal.id)
      toast.success('Progress recalculated from your session log.')
      refetch()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const toggleStatus = async (goal) => {
    const next = goal.status === 'COMPLETED' ? 'ACTIVE' : 'COMPLETED'
    try {
      await goalsApi.update(goal.id, { status: next })
      toast.success(next === 'COMPLETED' ? 'Marked complete. 🎉' : 'Reopened.')
      refetch()
    } catch (err) {
      toast.error(err.message)
    }
  }

  return (
    <Page className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-bold tracking-tight">Goals & milestones</h1>
          <p className="mt-1 text-[13.5px] text-3">
            Progress is derived from your practice log, so it is always truthful.
          </p>
        </div>
        <Button variant="primary" onClick={() => setFormOpen(true)}>
          <span className="text-base leading-none">+</span> Set a goal
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          { label: 'Total goals', value: summary.total ?? 0, icon: '🎯', tone: 'violet' },
          { label: 'In progress', value: summary.active ?? 0, icon: '⚡', tone: 'sky' },
          { label: 'Completed', value: summary.completed ?? 0, icon: '🏆', tone: 'emerald' },
          {
            label: 'Average progress',
            value: `${percentLabel(summary.average_progress ?? 0)}%`,
            icon: '📊',
            tone: 'amber',
          },
        ].map((item) => (
          <Card key={item.label} className="flex items-center gap-3 p-4">
            <span
              className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-[18px] ring-1 ring-white/10"
              style={{ background: `${accent(item.tone).hex}22` }}
            >
              {item.icon}
            </span>
            <div>
              <p className="text-[10.5px] uppercase tracking-wider text-3">{item.label}</p>
              <p className="text-[18px] font-bold tabular">{item.value}</p>
            </div>
          </Card>
        ))}
      </div>

      <PillGroup items={STATUS_FILTERS} value={status} onChange={setStatus} />

      {loading ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="skeleton h-64 rounded-2xl" />
          ))}
        </div>
      ) : goals.length === 0 ? (
        <Card>
          <EmptyState
            icon="🎯"
            title="No goals yet"
            message="A goal turns vague intention into a number you can move. Pick a skill, a target and a deadline — we generate the milestones for you."
            action={
              <Button variant="primary" onClick={() => setFormOpen(true)}>
                Set your first goal
              </Button>
            }
          />
        </Card>
      ) : (
        <Stagger className="grid gap-4 lg:grid-cols-2">
          {goals.map((goal) => (
            <StaggerItem key={goal.id}>
              <GoalCard
                goal={goal}
                onEdit={() => {
                  setEditing(goal)
                  setFormOpen(true)
                }}
                onDelete={() => setDeleting(goal)}
                onToggleStatus={() => toggleStatus(goal)}
                onRebuild={() => rebuild(goal)}
              />
            </StaggerItem>
          ))}
        </Stagger>
      )}

      {(achievements?.items || []).length > 0 && (
        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Milestones achieved</h2>
          <p className="mt-0.5 text-[12.5px] text-3">The moments worth remembering</p>
          <div className="mt-5 space-y-2.5">
            {achievements.items.map((item) => (
              <div
                key={item.id}
                className="flex items-center gap-3.5 rounded-xl border border-emerald-400/15 bg-emerald-400/[0.05] p-3.5"
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-400/15 text-[18px]">
                  {item.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13.5px] font-semibold">{item.title}</p>
                  <p className="truncate text-[12px] text-3">
                    {item.goal_title} · {longDate(item.achieved_at)}
                  </p>
                </div>
                {item.proof_url && (
                  <a
                    href={item.proof_url}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 text-[12px] font-semibold text-brand-300 hover:text-brand-200"
                  >
                    View proof
                  </a>
                )}
              </div>
            ))}
          </div>
        </Card>
      )}

      <GoalForm
        open={formOpen}
        goal={editing}
        skills={skillsData?.items || []}
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
        title="Delete this goal?"
        message={`“${deleting?.title}” and its milestones will be permanently removed. Your practice sessions are not affected.`}
        confirmLabel="Delete goal"
      />
    </Page>
  )
}

/* -------------------------------------------------------------- goal card */
function GoalCard({ goal, onEdit, onDelete, onToggleStatus, onRebuild }) {
  const tone = goal.status === 'COMPLETED' ? 'emerald' : goal.skill_accent || 'violet'
  const achieved = (goal.milestones || []).filter((m) => m.achieved).length
  const total = (goal.milestones || []).length || 1

  return (
    <Card className="group relative h-full overflow-hidden p-6">
      <div
        className="pointer-events-none absolute -right-12 -top-14 h-40 w-40 rounded-full opacity-30 blur-3xl"
        style={{ background: accent(tone).glow }}
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {goal.skill_icon && (
                <span className="text-[15px]">{goal.skill_icon}</span>
              )}
              <Badge tone={goal.status === 'COMPLETED' ? 'emerald' : 'violet'} size="sm" dot>
                {goal.status}
              </Badge>
              {goal.kind === 'WEEKLY' && (
                <Badge tone="sky" size="sm">
                  Weekly
                </Badge>
              )}
            </div>
            <h3 className="mt-2 text-[16px] font-semibold tracking-tight">{goal.title}</h3>
            {goal.skill_title && (
              <Link
                to={`/app/skills/${goal.skill_id}`}
                className="mt-0.5 inline-block text-[12px] text-3 hover:text-brand-300"
              >
                {goal.skill_title}
              </Link>
            )}
          </div>
          <div className="flex shrink-0 gap-1 opacity-0 transition group-hover:opacity-100">
            <Button variant="quiet" size="icon-sm" onClick={onEdit} aria-label="Edit goal">
              ✎
            </Button>
            <Button variant="quiet" size="icon-sm" onClick={onDelete} aria-label="Delete goal">
              🗑
            </Button>
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 flex items-end justify-between">
            <span className="text-[26px] font-bold leading-none tabular">
              {percentLabel(goal.progress_percent)}%
            </span>
            <span className="text-[12.5px] text-2 tabular">
              <span className="font-semibold text-1">{goal.current_value}</span> / {goal.target_value}{' '}
              {goal.unit}
            </span>
          </div>
          <Progress value={goal.progress_percent} tone={tone} size="md" />
        </div>

        {/* milestone track */}
        {goal.milestones?.length > 0 && (
          <div className="mt-5">
            <div className="mb-2.5 flex items-center justify-between text-[11.5px]">
              <span className="text-3">Milestones</span>
              <span className="tabular text-2">
                {achieved} of {total}
              </span>
            </div>
            <div className="relative">
              <div className="absolute left-0 right-0 top-3 h-0.5 rounded-full bg-white/[0.08]" />
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${goal.progress_percent}%` }}
                transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                className="absolute left-0 top-3 h-0.5 rounded-full"
                style={{ background: accent(tone).hex }}
              />
              <div className="relative flex justify-between">
                {(goal.milestones || []).map((milestone) => (
                  <div key={milestone.id} className="flex flex-col items-center gap-1.5">
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      transition={{ delay: 0.3, type: 'spring', stiffness: 300 }}
                      className={`grid h-6 w-6 place-items-center rounded-full text-[10px] font-bold ring-2 transition ${
                        milestone.achieved
                          ? 'bg-emerald-400 text-ink-950 ring-emerald-400/30'
                          : 'bg-white/[0.08] text-3 ring-white/10'
                      }`}
                    >
                      {milestone.achieved ? '✓' : ''}
                    </motion.span>
                    <span className="max-w-[68px] text-center text-[9.5px] leading-tight text-3">
                      {milestone.title.replace(' · quarter', ' Q')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/5 pt-4">
          <div className="text-[11.5px] text-3">
            {goal.deadline ? (
              <>
                Deadline <span className="font-semibold text-2">{longDate(goal.deadline)}</span>{' '}
                <span className="text-3">({relativeDay(goal.deadline)})</span>
              </>
            ) : (
              'No deadline'
            )}
          </div>
          <div className="flex gap-1.5">
            <Button variant="quiet" size="sm" onClick={onRebuild} title="Recalculate from the session log">
              Recalculate
            </Button>
            <Button
              variant={goal.status === 'COMPLETED' ? 'ghost' : 'primary'}
              size="sm"
              onClick={onToggleStatus}
            >
              {goal.status === 'COMPLETED' ? 'Reopen' : 'Mark done'}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  )
}

/* -------------------------------------------------------------- goal form */
function GoalForm({ open, goal, skills, onClose, onSaved }) {
  const toast = useToast()
  const isEdit = Boolean(goal)
  const [form, setForm] = useState({
    title: '',
    skill_id: '',
    description: '',
    target_value: 20,
    unit: 'hours',
    kind: 'TOTAL',
    deadline: isoDateOffset(60),
    status: 'ACTIVE',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const [loadedFor, setLoadedFor] = useState(null)
  if (open && loadedFor !== (goal?.id || 'new')) {
    setLoadedFor(goal?.id || 'new')
    setError('')
    setForm(
      goal
        ? {
            title: goal.title,
            skill_id: goal.skill_id || '',
            description: goal.description || '',
            target_value: goal.target_value,
            unit: goal.unit,
            kind: goal.kind,
            deadline: goal.deadline || isoDateOffset(60),
            status: goal.status,
          }
        : {
            title: '',
            skill_id: skills[0]?.id || '',
            description: '',
            target_value: 20,
            unit: 'hours',
            kind: 'TOTAL',
            deadline: isoDateOffset(60),
            status: 'ACTIVE',
          },
    )
  }

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const preview = useMemo(
    () =>
      MILESTONE_STEPS.map((fraction, i) => ({
        title: `${round(fraction * Number(form.target_value || 0))} ${shortUnit(form.unit)} · quarter ${i + 1}`,
        target_value: round(fraction * Number(form.target_value || 0)),
      })),
    [form.target_value, form.unit],
  )

  const submit = async (event) => {
    event.preventDefault()
    if (form.title.trim().length < 2) {
      setError('Give your goal a clear title.')
      return
    }
    if (!Number(form.target_value) || Number(form.target_value) <= 0) {
      setError('Set a target greater than zero.')
      return
    }
    setError('')
    setSaving(true)
    try {
      if (isEdit) {
        await goalsApi.update(goal.id, {
          title: form.title.trim(),
          skill_id: form.skill_id || null,
          description: form.description.trim(),
          target_value: Number(form.target_value),
          unit: form.unit,
          kind: form.kind,
          deadline: form.deadline || null,
          status: form.status,
        })
        toast.success('Goal updated.')
      } else {
        await goalsApi.create({
          title: form.title.trim(),
          skill_id: form.skill_id || null,
          description: form.description.trim(),
          target_value: Number(form.target_value),
          unit: form.unit,
          kind: form.kind,
          deadline: form.deadline || null,
          milestones: preview.map((m) => ({ title: m.title, target_value: m.target_value })),
        })
        toast.celebrate(`Goal set: ${form.title.trim()}. Four milestones are ready.`)
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
      title={isEdit ? 'Edit goal' : 'Set a goal'}
      subtitle={
        isEdit
          ? 'Progress is recalculated from your sessions after every change.'
          : 'We generate four milestones for you — you can change them later.'
      }
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="goal-form" loading={saving}>
            {isEdit ? 'Save changes' : 'Create goal'}
          </Button>
        </>
      }
    >
      <form id="goal-form" onSubmit={submit} className="space-y-4">
        <Field label="Goal title" htmlFor="goal-title" required>
          <Input
            id="goal-title"
            placeholder="Play three songs end to end"
            value={form.title}
            onChange={set('title')}
            maxLength={160}
            required
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Track which skill?" htmlFor="goal-skill" hint="Links progress to that skill's sessions">
            <Select id="goal-skill" value={form.skill_id} onChange={set('skill_id')}>
              <option value="">No specific skill</option>
              {skills.map((skill) => (
                <option key={skill.id} value={skill.id}>
                  {skill.icon} {skill.title}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deadline" htmlFor="goal-deadline">
            <Input id="goal-deadline" type="date" value={form.deadline || ''} onChange={set('deadline')} />
          </Field>
        </div>

        <div className="surface-2 grid gap-4 rounded-2xl p-4 sm:grid-cols-3">
          <Field label="Target" htmlFor="goal-target" required>
            <Input
              id="goal-target"
              type="number"
              min="1"
              step="any"
              value={form.target_value}
              onChange={set('target_value')}
            />
          </Field>
          <Field label="Unit" htmlFor="goal-unit">
            <Select id="goal-unit" value={form.unit} onChange={set('unit')}>
              {GOAL_UNITS.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Type" htmlFor="goal-kind" hint="Weekly resets each Monday">
            <Select id="goal-kind" value={form.kind} onChange={set('kind')}>
              <option value="TOTAL">Total</option>
              <option value="WEEKLY">Weekly</option>
            </Select>
          </Field>
        </div>

        {!isEdit && (
          <div className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
            <p className="text-[12.5px] font-semibold">Milestones we will create</p>
            <ul className="mt-2.5 space-y-1.5">
              {preview.map((milestone) => (
                <li key={milestone.title} className="flex items-center gap-2.5 text-[12.5px] text-2">
                  <span className="grid h-4 w-4 place-items-center rounded-full bg-white/10 text-[9px]">•</span>
                  {milestone.title}
                </li>
              ))}
            </ul>
          </div>
        )}

        <Field label="Notes" htmlFor="goal-description">
          <Textarea
            id="goal-description"
            rows={2}
            placeholder="Why this matters to you"
            value={form.description}
            onChange={set('description')}
            maxLength={2000}
          />
        </Field>

        {error && (
          <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-200">
            {error}
          </p>
        )}
      </form>
    </Modal>
  )
}

function round(value) {
  return Math.round(value * 10) / 10
}

function shortUnit(unit) {
  return GOAL_UNITS.find((u) => u.id === unit)?.short || unit
}
