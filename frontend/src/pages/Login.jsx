import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { ApiError } from '../lib/api'
import { Brand } from '../components/layout/AppShell'
import { Button, Field, Input } from '../components/ui'

/** Demo accounts surfaced on the login screen so reviewers can test instantly. */
export const DEMO_ACCOUNTS = [
  { email: 'user@test.com', name: 'Aarav Sharma', role: 'Primary walkthrough', icon: '🎯' },
  { email: 'aisha@test.com', name: 'Aisha Rahman', role: 'Photography', icon: '📷' },
  { email: 'dev@test.com', name: 'Devansh Rao', role: 'Coding', icon: '💻' },
  { email: 'marco@test.com', name: 'Marco Dsouza', role: 'Music', icon: '🎸' },
  { email: 'moderator@test.com', name: 'Nadia Petrov', role: 'Moderator role', icon: '🛡️' },
]
export const DEMO_PASSWORD = 'pass1234'

/** Shared split-screen shell for Login and Register. */
export function AuthLayout({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen">
      {/* form side */}
      <div className="flex w-full flex-col justify-center px-5 py-10 sm:px-10 lg:w-[54%] lg:px-16">
        <div className="mx-auto w-full max-w-[440px]">
          <Brand to="/" />
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="mt-10"
          >
            <h1 className="font-display text-[30px] font-bold leading-tight tracking-tight sm:text-[34px]">
              {title}
            </h1>
            {subtitle && <p className="mt-2.5 text-[14px] text-3">{subtitle}</p>}
            <div className="mt-8">{children}</div>
            {footer && <div className="mt-7 text-center text-[13.5px] text-3">{footer}</div>}
          </motion.div>
        </div>
      </div>

      {/* showcase side */}
      <div className="relative hidden overflow-hidden border-l border-white/5 lg:flex lg:w-[46%]">
        <div className="absolute -left-24 top-1/4 h-[420px] w-[420px] animate-aurora rounded-full bg-brand-600/25 blur-[120px]" />
        <div className="absolute -right-20 bottom-1/4 h-[380px] w-[380px] animate-aurora rounded-full bg-cyan-500/18 blur-[120px]" style={{ animationDelay: '-11s' }} />
        <div className="absolute inset-0 grid-bg opacity-50 mask-fade-b" />

        <div className="relative flex flex-col justify-center px-14">
          <blockquote className="max-w-md">
            <p className="font-display text-[27px] font-semibold leading-snug tracking-tight">
              “The habit was never motivation.
              <span className="text-gradient"> It was seeing the streak.</span>”
            </p>
          </blockquote>

          <div className="mt-10 space-y-3">
            {[
              { icon: '🔥', title: 'Streaks that count days, not logs' },
              { icon: '🎯', title: 'Goals that move when you practise' },
              { icon: '☁️', title: 'Cloud database + object storage' },
              { icon: '💬', title: 'A community that notices' },
            ].map((item, i) => (
              <motion.div
                key={item.title}
                initial={{ opacity: 0, x: -16 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.2 + i * 0.09 }}
                className="flex items-center gap-3 text-[13.5px] text-2"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.06] text-[15px] ring-1 ring-white/10">
                  {item.icon}
                </span>
                {item.title}
              </motion.div>
            ))}
          </div>

          <div className="mt-12 flex items-center gap-3 rounded-2xl border border-white/5 bg-white/[0.03] p-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-gradient text-[17px]">
              🎓
            </span>
            <p className="text-[12.5px] leading-relaxed text-3">
              A cloud computing project: identity, managed database, object storage, serverless
              stats, analytics — running entirely on your machine.
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Login() {
  const [email, setEmail] = useState('user@test.com')
  const [password, setPassword] = useState(DEMO_PASSWORD)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const location = useLocation()

  const submit = async (event) => {
    event.preventDefault()
    setError('')
    setLoading(true)
    try {
      const user = await signIn(email.trim(), password)
      toast.success(`Welcome back, ${user.name.split(' ')[0]}.`)
      navigate(location.state?.from || '/app', { replace: true })
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.message
          : 'Could not sign in. Is the backend running on port 8000?'
      setError(message)
      toast.error(message)
    } finally {
      setLoading(false)
    }
  }

  const useDemo = (demoEmail) => {
    setEmail(demoEmail)
    setPassword(DEMO_PASSWORD)
    setError('')
  }

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to pick up your streak where you left it."
      footer={
        <>
          New here?{' '}
          <Link to="/register" className="font-semibold text-brand-300 link-underline">
            Create an account
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="email" required>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </Field>

        <Field label="Password" htmlFor="password" required>
          <div className="relative">
            <Input
              id="password"
              name="password"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pr-11"
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword((s) => !s)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg px-2 py-1 text-[11px] font-semibold text-3 transition hover:bg-white/10 hover:text-1"
            >
              {showPassword ? 'Hide' : 'Show'}
            </button>
          </div>
        </Field>

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

        <Button type="submit" id="login" loading={loading} className="w-full" size="lg">
          {loading ? 'Signing in…' : 'Sign in'}
        </Button>
      </form>

      {/* demo credentials — the fastest path to a working account */}
      <div className="mt-7">
        <div className="flex items-center gap-3">
          <div className="divider flex-1" />
          <span className="text-[10.5px] font-bold uppercase tracking-[0.16em] text-3">
            Demo accounts
          </span>
          <div className="divider flex-1" />
        </div>
        <p className="mt-3 text-center text-[12px] text-3">
          Password for every demo account:{' '}
          <code className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[11.5px] text-1">
            {DEMO_PASSWORD}
          </code>
        </p>
        <div className="mt-3 space-y-1.5">
          {DEMO_ACCOUNTS.map((account) => (
            <button
              key={account.email}
              type="button"
              onClick={() => useDemo(account.email)}
              className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${
                email === account.email
                  ? 'border-brand-400/40 bg-brand-500/10'
                  : 'border-white/5 bg-white/[0.02] hover:border-white/10 hover:bg-white/[0.05]'
              }`}
            >
              <span className="text-[15px]">{account.icon}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[12.5px] font-semibold">{account.name}</span>
                <span className="block truncate font-mono text-[11px] text-3">{account.email}</span>
              </span>
              <span className="shrink-0 text-[10.5px] text-3">{account.role}</span>
            </button>
          ))}
        </div>
      </div>
    </AuthLayout>
  )
}
