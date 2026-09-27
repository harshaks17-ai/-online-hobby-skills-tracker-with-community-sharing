import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { authApi, usersApi } from '../lib/api'
import { longDate } from '../lib/format'
import { INTERESTS } from '../lib/constants'
import { Page } from '../components/Background'
import {
  Avatar, Badge, Button, Card, ConfirmDialog, Field, Input, Textarea,
} from '../components/ui'

const TABS = [
  { id: 'profile', label: 'Profile', icon: '👤' },
  { id: 'security', label: 'Security', icon: '🔒' },
  { id: 'data', label: 'Your data', icon: '🗄️' },
  { id: 'danger', label: 'Account', icon: '⚠️' },
]

export default function Settings() {
  const { user, setUser, signOut, refresh } = useAuth()
  const navigate = useNavigate()
  const [tab, setTab] = useState('profile')

  return (
    <Page className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-[13.5px] text-3">Manage your profile, security and data.</p>
      </div>

      <div className="no-scrollbar flex gap-1 overflow-x-auto rounded-xl bg-[rgb(var(--surface-1))] p-1 ring-1 ring-white/5">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`relative shrink-0 rounded-lg px-4 py-2.5 text-[13.5px] font-semibold transition-colors ${
              tab === item.id ? 'text-white' : 'text-3 hover:text-1'
            }`}
          >
            {tab === item.id && (
              <span className="absolute inset-0 rounded-lg bg-brand-gradient shadow-[0_6px_18px_-8px_rgba(116,80,245,0.9)]" />
            )}
            <span className="relative flex items-center gap-2">
              <span>{item.icon}</span>
              {item.label}
            </span>
          </button>
        ))}
      </div>

      {tab === 'profile' && <ProfileTab user={user} setUser={setUser} refresh={refresh} />}
      {tab === 'security' && <SecurityTab />}
      {tab === 'data' && <DataTab />}
      {tab === 'danger' && (
        <DangerTab
          onDeleted={async () => {
            await signOut()
            navigate('/')
          }}
        />
      )}
    </Page>
  )
}

/* ---------------------------------------------------------------- profile */
function ProfileTab({ user, setUser }) {
  const toast = useToast()
  const [form, setForm] = useState({
    name: user?.name || '',
    bio: user?.bio || '',
    location: user?.location || '',
    website: user?.website || '',
  })
  const [interests, setInterests] = useState(user?.interests || [])
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInput = useRef(null)

  useEffect(() => {
    setForm({
      name: user?.name || '',
      bio: user?.bio || '',
      location: user?.location || '',
      website: user?.website || '',
    })
    setInterests(user?.interests || [])
  }, [user])

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const dirty =
    form.name !== (user?.name || '') ||
    form.bio !== (user?.bio || '') ||
    form.location !== (user?.location || '') ||
    form.website !== (user?.website || '') ||
    JSON.stringify(interests) !== JSON.stringify(user?.interests || [])

  const save = async (event) => {
    event.preventDefault()
    setSaving(true)
    try {
      const data = await authApi.updateProfile({ ...form, interests })
      setUser(data.user)
      toast.success('Profile updated.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const { api } = await import('../lib/api')
      const asset = await api.upload('/api/files/upload', file, {
        scope: 'profile',
        visibility: 'public',
      })
      const data = await authApi.updateProfile({ avatar_url: asset.url })
      setUser(data.user)
      toast.success('Profile picture updated.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setUploading(false)
      event.target.value = ''
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <Card className="p-6">
        <div className="flex flex-wrap items-center gap-5">
          <div className="relative">
            <Avatar user={user} size={88} />
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={uploading}
              className="absolute -bottom-1 -right-1 grid h-8 w-8 place-items-center rounded-full bg-brand-gradient text-[13px] shadow-lift ring-2 ring-[rgb(var(--page))] transition hover:scale-105 disabled:opacity-60"
              aria-label="Change profile picture"
            >
              {uploading ? '…' : '📷'}
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              onChange={uploadAvatar}
              className="hidden"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[16px] font-semibold">{user?.name}</p>
            <p className="text-[13px] text-3">@{user?.username}</p>
            <p className="mt-1 text-[12px] text-3">
              {user?.email} · joined {longDate(user?.created_at)}
            </p>
            {user?.is_moderator && (
              <Badge tone="sky" className="mt-2">
                Moderator
              </Badge>
            )}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">Profile details</h2>
        <p className="mt-0.5 text-[12.5px] text-3">Visible on your public profile</p>
        <div className="mt-5 space-y-4">
          <Field label="Display name" htmlFor="s-name" required>
            <Input id="s-name" value={form.name} onChange={set('name')} maxLength={120} required />
          </Field>
          <Field label="Bio" htmlFor="s-bio" hint={`${form.bio.length}/400`}>
            <Textarea
              id="s-bio"
              rows={3}
              value={form.bio}
              onChange={set('bio')}
              maxLength={400}
              placeholder="What are you working on?"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Location" htmlFor="s-location">
              <Input
                id="s-location"
                value={form.location}
                onChange={set('location')}
                maxLength={120}
                placeholder="Bengaluru, India"
              />
            </Field>
            <Field label="Website" htmlFor="s-website" hint="Must start with http:// or https://">
              <Input
                id="s-website"
                value={form.website}
                onChange={set('website')}
                maxLength={200}
                placeholder="https://github.com/you"
              />
            </Field>
          </div>
          <Field label="Interests" hint="Used to personalise your Discover feed">
            <div className="flex flex-wrap gap-1.5">
              {INTERESTS.map((interest) => {
                const active = interests.includes(interest)
                return (
                  <button
                    key={interest}
                    type="button"
                    onClick={() =>
                      setInterests((current) =>
                        current.includes(interest)
                          ? current.filter((i) => i !== interest)
                          : [...current, interest].slice(0, 12),
                      )
                    }
                    className={`rounded-full px-3 py-1.5 text-[12px] font-semibold capitalize transition-all ${
                      active
                        ? 'bg-brand-gradient text-white'
                        : 'bg-white/[0.04] text-3 ring-1 ring-white/5 hover:text-1'
                    }`}
                  >
                    {interest}
                  </button>
                )
              })}
            </div>
          </Field>
        </div>
        <div className="mt-6 flex items-center justify-end gap-3 border-t border-white/5 pt-5">
          {dirty && <span className="text-[12px] text-3">Unsaved changes</span>}
          <Button type="submit" loading={saving} disabled={!dirty}>
            Save changes
          </Button>
        </div>
      </Card>
    </form>
  )
}

/* --------------------------------------------------------------- security */
function SecurityTab() {
  const toast = useToast()
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm: '' })
  const [saving, setSaving] = useState(false)

  const set = (key) => (event) => setForm((f) => ({ ...f, [key]: event.target.value }))

  const submit = async (event) => {
    event.preventDefault()
    if (form.new_password !== form.confirm) {
      toast.error('New passwords do not match.')
      return
    }
    setSaving(true)
    try {
      await authApi.changePassword({
        current_password: form.current_password,
        new_password: form.new_password,
      })
      toast.success('Password changed.')
      setForm({ current_password: '', new_password: '', confirm: '' })
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">Change password</h2>
        <p className="mt-0.5 text-[12.5px] text-3">
          Minimum 8 characters, mixing letters and numbers.
        </p>
        <form onSubmit={submit} className="mt-5 space-y-4">
          <Field label="Current password" htmlFor="cur-pass" required>
            <Input
              id="cur-pass"
              type="password"
              autoComplete="current-password"
              value={form.current_password}
              onChange={set('current_password')}
              required
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" htmlFor="new-pass" required>
              <Input
                id="new-pass"
                type="password"
                autoComplete="new-password"
                value={form.new_password}
                onChange={set('new_password')}
                required
              />
            </Field>
            <Field label="Confirm new password" htmlFor="conf-pass" required>
              <Input
                id="conf-pass"
                type="password"
                autoComplete="new-password"
                value={form.confirm}
                onChange={set('confirm')}
                required
              />
            </Field>
          </div>
          <div className="flex justify-end border-t border-white/5 pt-5">
            <Button type="submit" loading={saving} disabled={!form.current_password || !form.new_password}>
              Update password
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">How your account is protected</h2>
        <div className="mt-4 space-y-3">
          {[
            ['Password storage', 'PBKDF2-HMAC-SHA256, 210,000 iterations, unique salt per user'],
            ['Sessions', 'Stateless JWT — access token in memory, refresh token in an HttpOnly cookie'],
            ['Login safety', 'Identical error for a wrong password and an unknown e-mail'],
            ['Rate limiting', 'Stricter budget on the login and register endpoints'],
            ['Uploads', 'Type, extension, magic bytes and full decode are all verified'],
            ['Authorization', 'Ownership is re-checked server-side on every mutation'],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-wrap items-baseline gap-2 border-b border-white/[0.04] pb-3 last:border-0">
              <span className="w-36 shrink-0 text-[12.5px] font-semibold">{label}</span>
              <span className="flex-1 text-[12.5px] text-3">{value}</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ------------------------------------------------------------------- data */
function DataTab() {
  const toast = useToast()
  const [exporting, setExporting] = useState(false)

  const exportData = async () => {
    setExporting(true)
    try {
      const payload = await authApi.exportData()
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `hobbylog-export-${new Date().toISOString().slice(0, 10)}.json`
      link.click()
      URL.revokeObjectURL(url)
      toast.success('Export ready. Your password hash is never included.')
    } catch (err) {
      toast.error(err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="space-y-4">
      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">Export everything</h2>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-3">
          Download a machine-readable copy of your profile, skills, sessions, goals and posts. This
          is your data — you should never have to ask us for it.
        </p>
        <Button variant="primary" className="mt-5" onClick={exportData} loading={exporting}>
          ⬇ Download my data
        </Button>
      </Card>

      <Card className="p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight">Privacy by default</h2>
        <ul className="mt-4 space-y-2.5 text-[12.5px] leading-relaxed text-2">
          {[
            'Your e-mail address is never exposed on any public endpoint.',
            'Other people only see skills you have marked public.',
            'Uploaded proof images are private by default and served via signed URLs.',
            'Following someone does not share your practice history with them.',
            'Deleting your account removes your rows, files and social graph immediately.',
          ].map((item) => (
            <li key={item} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
              {item}
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}

/* ----------------------------------------------------------------- danger */
function DangerTab({ onDeleted }) {
  const toast = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmText, setConfirmText] = useState('')
  const [deleting, setDeleting] = useState(false)

  const remove = async () => {
    setDeleting(true)
    try {
      await usersApi.deleteAccount()
      toast.success('Your account and all associated data were deleted.')
      onDeleted()
    } catch (err) {
      toast.error(err.message)
      setDeleting(false)
    }
  }

  return (
    <>
      <Card className="border-rose-400/20 p-6">
        <h2 className="text-[15.5px] font-semibold tracking-tight text-rose-300">Delete account</h2>
        <p className="mt-0.5 text-[12.5px] leading-relaxed text-3">
          This permanently removes your profile, skills, every practice session, goals, milestones,
          posts, comments, likes, follows and uploaded files. There is no undo and no backup — export
          your data first if you want to keep it.
        </p>
        <div className="mt-5 space-y-3">
          <Field label="Type DELETE to confirm" htmlFor="confirm-delete">
            <Input
              id="confirm-delete"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
            />
          </Field>
          <Button
            variant="danger"
            disabled={confirmText.trim().toUpperCase() !== 'DELETE'}
            onClick={() => setConfirmOpen(true)}
          >
            Delete my account
          </Button>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={remove}
        title="This cannot be undone"
        message="All of your data will be permanently deleted, including every logged practice session. Are you sure?"
        confirmLabel="Yes, delete everything"
        loading={deleting}
      />
    </>
  )
}
