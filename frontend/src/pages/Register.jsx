import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ApiError, skillsApi } from '../lib/api'
import { INTERESTS, SKILL_ICONS, CATEGORIES } from '../lib/constants'
import { AuthLayout } from './Login'
import { Button, Field, Input, Select } from '../components/ui'

/** Small live password-strength meter. */
function strengthOf(password) {
  let score = 0
  if (password.length >= 8) score += 1
  if (password.length >= 12) score += 1
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score += 1
  if (/\d/.test(password)) score += 1
  if (/[^A-Za-z0-9]/.test(password)) score += 1
  return Math.min(4, score)
}

const STRENGTH = [
  { label: 'Too short', tone: 'bg-rose-500', text: 'text-rose-300' },
  { label: 'Weak', tone: 'bg-rose-500', text: 'text-rose-300' },
  { label: 'Fair', tone: 'bg-amber-500', text: 'text-amber-300' },
  { label: 'Good', tone: 'bg-lime-500', text: 'text-lime-300' },
  { label: 'Strong', tone: 'bg-emerald-500', text: 'text-emerald-300' },
]

export default function Register() {
  const [form, setForm] = useState({
    name: '',
    username: '',
    email: '',
    password: '',
    confirm: '',
    bio: '',
  })
  const [interests, setInterests] = useState([])
  const [firstSkill, setFirstSkill] = useState({ title: '', category: 'music', icon: '🎸' })
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signUp } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const strength = useMemo(() => strengthOf(form.password), [form.password])
  const usernameValid = /^[a-z0-9_.]{3,24}$/.test(form.username.toLowerCase())
  const passwordsMatch = form.password === form.confirm
  const canSubmit =
    form.name.trim().length >= 2 &&
    usernameValid &&
    form.email.includes('@') &&
    form.password.length >= 8 &&
    passwordsMatch

  const toggleInterest = (value) =>
    setInterests((current) =>
      current.includes(value) ? current.filter((i) => i !== value) : [...current, value].slice(0, 12),
    )

  const submit = async (event) => {
    event.preventDefault()
    if (!canSubmit) {
      setError('Please fix the highlighted fields.')
      return
    }
    setError('')
    setLoading(true)
    try {
      const user = await signUp({
        name: form.name.trim(),
        username: form.username.trim().toLowerCase(),
        email: form.email.trim().toLowerCase(),
        password: form.password,
        bio: form.bio.trim(),
        interests,
      })
      // Optional: create the user's first skill right after sign-up so the
      // dashboard is never an empty state on first login.
      if (firstSkill.title.trim().length >= 2) {
        try {
          await skillsApi.create({
            title: firstSkill.title.trim(),
            category: firstSkill.category,
            icon: firstSkill.icon,
            goal_per_week: 180,
            minutes_per_session: 30,
          })
        } catch {
          // Non-fatal: the account already exists, the first skill is optional.
        }
      }
      toast.celebrate(`Welcome to HobbyLog, ${user.name.split(' ')[0]}! 🎉`)
      navigate('/app', { replace: true })
    } catch (err) {
      const message = err instanceof ApiError ? err.message : 'Could not create your account.'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Create your account"
      subtitle="Free, instant, and your data stays yours — export or delete it any time."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/login" className="font-semibold text-brand-300 link-underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" htmlFor="name" required>
            <Input id="name" autoComplete="name" placeholder="Aarav Sharma" value={form.name} onChange={set('name')} required />
          </Field>
          <Field
            label="Username"
            htmlFor="username"
            required
            error={form.username && !usernameValid ? '3–24 chars: lowercase, digits, . or _' : ''}
            hint={!form.username ? 'This is your public handle' : undefined}
          >
            <Input
              id="username"
              autoComplete="username"
              placeholder="aarav"
              value={form.username}
              onChange={(e) => setForm((f) => ({ ...f, username: e.target.value.toLowerCase().replace(/[^a-z0-9_.]/g, '') }))}
              required
            />
          </Field>
        </div>

        <Field label="Email" htmlFor="email" required>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Password" htmlFor="password" required>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                value={form.password}
                onChange={set('password')}
                className="pr-11"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-semibold text-3 transition hover:bg-white/10 hover:text-1"
              >
                {showPassword ? 'Hide' : 'Show'}
              </button>
            </div>
            {form.password && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className={`h-1 flex-1 rounded-full transition-colors ${
                        i < strength ? STRENGTH[strength].tone : 'bg-white/10'
                      }`}
                    />
                  ))}
                </div>
                <span className={`text-[11px] font-semibold ${STRENGTH[strength].text}`}>
                  {STRENGTH[strength].label}
                </span>
              </div>
            )}
          </Field>

          <Field
            label="Confirm password"
            htmlFor="confirm"
            required
            error={form.confirm && !passwordsMatch ? 'Passwords do not match' : ''}
          >
            <Input
              id="confirm"
              type={showPassword ? 'text' : 'password'}
              autoComplete="new-password"
              placeholder="Repeat it"
              value={form.confirm}
              onChange={set('confirm')}
              required
            />
          </Field>
        </div>

        <Field label="Short bio" htmlFor="bio" hint="Optional · shown on your public profile">
          <Input id="bio" placeholder="What are you working on?" value={form.bio} onChange={set('bio')} maxLength={400} />
        </Field>

        <Field label="Interests" hint="Pick a few — used to personalise Discover">
          <div className="flex flex-wrap gap-1.5">
            {INTERESTS.map((interest) => {
              const active = interests.includes(interest)
              return (
                <button
                  key={interest}
                  type="button"
                  onClick={() => toggleInterest(interest)}
                  className={`rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize transition-all ${
                    active
                      ? 'bg-brand-gradient text-white shadow-[0_8px_20px_-12px_rgba(116,80,245,0.9)]'
                      : 'bg-white/[0.04] text-3 ring-1 ring-white/5 hover:text-2'
                  }`}
                >
                  {interest}
                </button>
              )
            })}
          </div>
        </Field>

        <div className="surface-2 rounded-2xl p-4">
          <p className="text-[12.5px] font-semibold">
            <span className="text-brand-300">Optional.</span> Add your first skill now
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
            <Input
              id="first-skill"
              placeholder="e.g. Guitar, Running, Python"
              value={firstSkill.title}
              onChange={(e) => setFirstSkill((s) => ({ ...s, title: e.target.value }))}
            />
            <Select
              value={firstSkill.category}
              onChange={(e) => setFirstSkill((s) => ({ ...s, category: e.target.value }))}
              className="sm:w-40"
              aria-label="Skill category"
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </Select>
            <Select
              value={firstSkill.icon}
              onChange={(e) => setFirstSkill((s) => ({ ...s, icon: e.target.value }))}
              className="sm:w-20"
              aria-label="Skill icon"
            >
              {SKILL_ICONS.map((icon) => (
                <option key={icon} value={icon}>
                  {icon}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {error && (
          <motion.p
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            role="alert"
            className="flex items-start gap-2.5 rounded-xl border border-rose-400/25 bg-rose-500/10 px-3.5 py-3 text-[12.5px] font-medium text-rose-200"
          >
            <span className="mt-0.5">⚠</span>
            {error}
          </motion.p>
        )}

        <Button type="submit" id="register" loading={loading} disabled={!canSubmit} className="w-full" size="lg">
          Create account
        </Button>

        <p className="text-center text-[11.5px] leading-relaxed text-3">
          Passwords are hashed with PBKDF2-HMAC-SHA256 (210,000 iterations) and never stored in
          plain text.
        </p>
      </form>
    </AuthLayout>
  )
}
