import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { useToast } from '../../context/ToastContext'
import { practiceApi, skillsApi } from '../../lib/api'
import { useAsync } from '../../lib/hooks'
import { humanMinutes, isoToday, percentLabel } from '../../lib/format'
import { MOODS, QUICK_LOG_MINUTES, accent } from '../../lib/constants'
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '../ui'

/**
 * The practice logger.
 *
 * One component powers the dashboard quick-log, the Practice page and the
 * per-skill quick-log, so the write path (and its validation + celebration
 * feedback) is identical everywhere. The API returns every derived change
 * (goal progress, new badges, refreshed stats) in the same response, so the UI
 * never has to recompute anything.
 */
export function LogPracticeModal({ open, onClose, skills: providedSkills, defaultSkillId, onLogged }) {
  const toast = useToast()
  const [searchParams] = useSearchParams()
  const { data, loading } = useAsync(
    () => (providedSkills ? Promise.resolve({ items: providedSkills }) : skillsApi.list()),
    [open, providedSkills],
  )
  const skills = data?.items || []

  const [skillId, setSkillId] = useState(defaultSkillId || '')
  const [minutes, setMinutes] = useState(30)
  const [activity, setActivity] = useState('')
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState(isoToday())
  const [mood, setMood] = useState('good')
  const [share, setShare] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    const preset = defaultSkillId || searchParams.get('skill')
    const first = preset || skills[0]?.id || ''
    setSkillId(first)
    const match = skills.find((s) => s.id === first)
    setMinutes(match?.minutes_per_session || 30)
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, defaultSkillId])

  useEffect(() => {
    if (!open) return
    if (!skillId && skills.length) {
      const first = defaultSkillId || skills[0].id
      setSkillId(first)
      setMinutes(skills.find((s) => s.id === first)?.minutes_per_session || 30)
    }
  }, [skills, skillId, open, defaultSkillId])

  const selected = useMemo(() => skills.find((s) => s.id === skillId), [skills, skillId])

  const submit = async (event) => {
    event.preventDefault()
    if (!skillId) {
      setError('Pick a skill first.')
      return
    }
    if (!minutes || minutes < 1) {
      setError('Enter how many minutes you practised.')
      return
    }
    setError('')
    setSaving(true)
    try {
      const result = await practiceApi.log({
        skill_id: skillId,
        duration_minutes: Number(minutes),
        activity: activity.trim(),
        notes: notes.trim(),
        practiced_at: new Date(`${date}T12:00:00`).toISOString(),
        mood,
        share_to_feed: share,
      })

      // Celebrate in the same order the data changed: streak, badges, goals.
      const streak = result.stats?.current_streak || 0
      if (streak > 0) {
        toast.success(
          `Logged ${humanMinutes(minutes)} of ${selected?.title || 'practice'}. Streak: ${streak} day${streak === 1 ? '' : 's'}.`,
        )
      }
      ;(result.new_badges || []).forEach((badge) => {
        window.setTimeout(
          () => toast.celebrate(`${badge.icon} Badge unlocked — ${badge.title}`, { title: 'Achievement' }),
          350,
        )
      })
      ;(result.goals_completed || []).forEach((goalTitle) => {
        window.setTimeout(() => toast.celebrate(`Goal complete: ${goalTitle}`, { title: 'Milestone' }), 700)
      })
      if ((result.new_badges || []).length === 0 && (result.goals_completed || []).length === 0) {
        // already toasted the streak message
      }

      setActivity('')
      setNotes('')
      setMinutes(selected?.minutes_per_session || 30)
      onLogged?.(result)
      onClose?.()
    } catch (err) {
      setError(err.message || 'Could not save that session.')
      toast.error(err.message || 'Could not save that session.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Log Practice"
      subtitle="One write updates your streak, goals, badges and charts."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="log-practice-form" id="saveLog" loading={saving}>
            Save session
          </Button>
        </>
      }
    >
      <form id="log-practice-form" onSubmit={submit} className="space-y-4">
        {loading ? (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-11" />
            ))}
          </div>
        ) : skills.length === 0 ? (
          <div className="surface-2 rounded-xl p-5 text-center">
            <p className="text-[13.5px] text-2">You have no skills yet.</p>
            <p className="mt-1 text-[12.5px] text-3">Create one first, then come back and log it.</p>
            <Button variant="primary" size="sm" className="mt-4" onClick={onClose}>
              Go to skills
            </Button>
          </div>
        ) : (
          <>
            <Field label="Skill" htmlFor="log-skill" required>
              <Select id="log-skill" value={skillId} onChange={(e) => {
                setSkillId(e.target.value)
                setMinutes(skills.find((s) => s.id === e.target.value)?.minutes_per_session || 30)
              }}>
                {skills.map((skill) => (
                  <option key={skill.id} value={skill.id}>
                    {skill.icon} {skill.title}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="How long did you practise?" htmlFor="minutes" required>
              <div className="flex items-center gap-3">
                <Input
                  id="minutes"
                  type="number"
                  min="1"
                  max="1440"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  className="w-28 text-center text-lg font-bold tabular"
                  required
                />
                <span className="text-[13px] text-3">minutes</span>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {QUICK_LOG_MINUTES.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setMinutes(preset)}
                    className={`rounded-lg px-2.5 py-1.5 text-[12px] font-semibold transition ${
                      Number(minutes) === preset
                        ? 'bg-brand-gradient text-white'
                        : 'bg-white/[0.05] text-3 hover:text-1'
                    }`}
                  >
                    {preset < 60 ? `${preset}m` : preset === 60 ? '1h' : `${preset / 60}h`}
                  </button>
                ))}
              </div>
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="What did you work on?" htmlFor="log-activity">
                <Input
                  id="log-activity"
                  placeholder="Scale practice, refactor sprint, golden hour walk…"
                  value={activity}
                  onChange={(e) => setActivity(e.target.value)}
                  maxLength={200}
                />
              </Field>
              <Field label="Date" htmlFor="log-date">
                <Input
                  id="log-date"
                  type="date"
                  value={date}
                  max={isoToday()}
                  onChange={(e) => setDate(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Notes" htmlFor="notes" hint="What worked, what did not, what to change next time">
              <Textarea
                id="notes"
                rows={3}
                placeholder="Thumb finally caught up with the metronome at 120bpm…"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={2000}
              />
            </Field>

            <Field label="How did it feel?">
              <div className="flex flex-wrap gap-1.5">
                {MOODS.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => setMood(option.id)}
                    className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-[12.5px] font-semibold transition-all ${
                      mood === option.id
                        ? 'bg-brand-gradient text-white'
                        : 'bg-white/[0.04] text-3 ring-1 ring-white/5 hover:text-1'
                    }`}
                  >
                    <span className="text-[14px]">{option.icon}</span>
                    {option.label}
                  </button>
                ))}
              </div>
            </Field>

            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-white/5 bg-white/[0.02] p-3.5 transition hover:border-white/10">
              <input
                type="checkbox"
                checked={share}
                onChange={(e) => setShare(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-[#8b74ff]"
              />
              <span>
                <span className="block text-[13px] font-semibold">Share this to the community feed</span>
                <span className="mt-0.5 block text-[12px] text-3">
                  Creates a post with your activity and notes attached.
                </span>
              </span>
            </label>

            {selected && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="surface-2 flex items-center gap-3 rounded-xl p-3"
                >
                  <span
                    className="grid h-9 w-9 place-items-center rounded-lg text-[16px]"
                    style={{ background: `${accent(selected.accent).hex}22` }}
                  >
                    {selected.icon}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12.5px] font-semibold">{selected.title}</div>
                    <div className="text-[11.5px] text-3">
                      {humanMinutes(selected.weekly_minutes)} of {humanMinutes(selected.goal_per_week)} this week
                    </div>
                  </div>
                  <Badge tone={selected.accent === 'violet' ? 'violet' : 'slate'} size="sm">
                    {percentLabel(selected.progress_percent)}%
                  </Badge>
                </motion.div>
              </AnimatePresence>
            )}

            {error && (
              <p role="alert" className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-2.5 text-[12.5px] font-medium text-rose-200">
                {error}
              </p>
            )}
          </>
        )}
      </form>
    </Modal>
  )
}
