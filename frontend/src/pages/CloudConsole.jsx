import { useMemo, useRef, useState } from 'react'
import { useToast } from '../context/ToastContext'
import { filesApi, platformApi } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { bytes } from '../lib/format'
import { accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import {
  Badge, Button, Card, ConfirmDialog, EmptyState, Progress, Tooltip, useCopy,
} from '../components/ui'

const LAYERS = [
  { name: 'Browser / SPA', tech: 'React 19 + Vite', role: 'UI, optimistic updates, charts', tone: 'violet' },
  { name: 'Edge / CDN', tech: 'Static hosting + cache', role: 'TLS, asset caching, rate limit', tone: 'sky' },
  { name: 'API gateway', tech: 'REST / JSON', role: 'Auth, routing, quotas', tone: 'cyan' },
  { name: 'Application tier', tech: 'FastAPI (stateless)', role: 'Business rules, authorization', tone: 'emerald' },
  { name: 'Identity', tech: 'JWT (HS256)', role: 'AuthN, token issue/verify', tone: 'rose' },
  { name: 'Cloud database', tech: 'Cloud SQL / Firestore', role: 'Rows, indexes, constraints', tone: 'amber' },
  { name: 'Object storage', tech: 'S3 / Cloud Storage', role: 'Bytes, signed URLs, CDN', tone: 'fuchsia' },
  { name: 'Serverless jobs', tech: 'Triggers + schedule', role: 'Stats roll-up, badges', tone: 'orange' },
  { name: 'Observability', tech: 'Structured logs', role: 'Latency, errors, alerts', tone: 'slate' },
]

const DATA_FLOW = [
  'Browser → CDN (static assets)',
  'Browser → API Gateway → FastAPI replica',
  'FastAPI → Identity service (verify JWT)',
  'FastAPI → Cloud DB (read / write rows)',
  'Browser → signed URL → Object Storage (bytes)',
  'FastAPI → event → worker → Cloud DB (stats roll-up)',
]

export default function CloudConsole() {
  const toast = useToast()
  const { copied, copy } = useCopy()
  const [deleting, setDeleting] = useState(null)
  const fileInput = useRef(null)

  const { data: health, refetch: refetchHealth } = useAsync(() => platformApi.health(), [])
  const { data: config } = useAsync(() => platformApi.config(), [])
  const { data: architecture } = useAsync(() => platformApi.architecture(), [])
  const { data: bucket, refetch: refetchBucket } = useAsync(() => filesApi.bucket(), [])
  const { data: myFiles, refetch: refetchFiles } = useAsync(() => filesApi.list(), [])

  const objects = bucket?.objects || []

  // Map an object key back to its metadata row so it can be deleted by id
  // (the bucket listing is key-based; the delete API is id-based).
  const idForKey = useMemo(() => {
    const map = new Map()
    ;(myFiles?.items || []).forEach((file) => map.set(file.storage_path, file))
    return map
  }, [myFiles])
  const maxSize = useMemo(
    () => Math.max(...objects.map((o) => o.size_bytes || 0), 1),
    [objects],
  )

  const refreshAll = () => {
    refetchHealth()
    refetchBucket()
    refetchFiles()
  }

  const upload = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return
    try {
      const { api } = await import('../lib/api')
      await api.upload('/api/files/upload', file, { scope: 'proof', visibility: 'public' })
      toast.success(`Uploaded ${file.name} (${bytes(file.size)}).`)
      refetchBucket()
    } catch (err) {
      toast.error(err.message)
    } finally {
      event.target.value = ''
    }
  }

  const remove = async () => {
    try {
      await filesApi.remove(deleting.id)
      toast.success('Object deleted from storage.')
      setDeleting(null)
      refetchBucket()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const db = health?.dependencies?.database
  const storage = health?.dependencies?.storage

  return (
    <Page className="space-y-6">
      <div>
        <h1 className="font-display text-[26px] font-bold tracking-tight">Cloud console</h1>
        <p className="mt-1 text-[13.5px] text-3">
          The infrastructure this app is running on, live.
        </p>
      </div>

      {/* health */}
      <Stagger className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: 'API status',
            value: health?.status || '…',
            sub: `${health?.service || ''} v${health?.version || ''}`,
            ok: health?.status === 'healthy',
            icon: '💓',
          },
          {
            label: 'Database',
            value: db?.healthy ? 'Reachable' : 'Down',
            sub: db?.latency_ms ? `${db.latency_ms} ms latency` : db?.error || '',
            ok: Boolean(db?.healthy),
            icon: '🗄️',
          },
          {
            label: 'Object storage',
            value: storage?.healthy ? 'Reachable' : 'Down',
            sub: storage?.bucket || '',
            ok: Boolean(storage?.healthy),
            icon: '🪣',
          },
          {
            label: 'Environment',
            value: config?.environment || '…',
            sub: `${config?.providers?.database || '—'} / ${config?.providers?.storage || '—'}`,
            ok: true,
            icon: '🌍',
          },
        ].map((item) => (
          <StaggerItem key={item.label}>
            <Card className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-3">
                    {item.label}
                  </p>
                  <p className="mt-2 flex items-center gap-2 font-display text-[19px] font-bold capitalize leading-none">
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        item.ok ? 'bg-emerald-400' : 'bg-rose-400'
                      }`}
                    />
                    <span className="truncate">{item.value}</span>
                  </p>
                  <p className="mt-1.5 truncate text-[11.5px] text-3">{item.sub}</p>
                </div>
                <span className="text-[20px]">{item.icon}</span>
              </div>
            </Card>
          </StaggerItem>
        ))}
      </Stagger>

      {/* bucket */}
      <Card className="p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[15.5px] font-semibold tracking-tight">Object storage bucket</h2>
            <p className="mt-0.5 text-[12.5px] text-3">
              {bucket?.bucket || 'bucket'} · {objects.length} object{objects.length === 1 ? '' : 's'} ·{' '}
              {bytes(bucket?.size_bytes || 0)} used
            </p>
          </div>
          <div className="flex gap-2">
            <input
              ref={fileInput}
              type="file"
              accept="image/*,application/pdf"
              onChange={upload}
              className="hidden"
            />
            <Button variant="ghost" size="sm" onClick={() => fileInput.current?.click()}>
              ⬆ Upload a test file
            </Button>
            <Button variant="quiet" size="sm" onClick={refreshAll}>
              Refresh
            </Button>
          </div>
        </div>

        <div className="mb-5 grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Key layout', value: bucket?.key_layout || '—' },
            { label: 'Encryption at rest', value: bucket?.encryption_at_rest ? 'Enabled' : '—' },
            { label: 'Signed URL TTL', value: `${Math.round((bucket?.signed_url_ttl_seconds || 0) / 60)} min` },
            { label: 'Provider', value: bucket?.provider || '—' },
          ].map((item) => (
            <div key={item.label} className="surface-2 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-wider text-3">{item.label}</p>
              <p className="mt-1 truncate text-[12.5px] font-semibold">{item.value}</p>
            </div>
          ))}
        </div>

        {!bucket ? (
          <div className="skeleton h-48" />
        ) : objects.length === 0 ? (
          <EmptyState
            icon="🪣"
            title="Bucket is empty"
            message="Upload an achievement image, or log a practice session with proof attached."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left">
              <thead>
                <tr className="border-b border-white/5 text-[10.5px] uppercase tracking-wider text-3">
                  <th className="pb-2.5 font-semibold">Object key</th>
                  <th className="pb-2.5 font-semibold">Size</th>
                  <th className="w-40 pb-2.5 font-semibold">Share</th>
                  <th className="pb-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody>
                {objects.map((object) => (
                  <tr key={object.key} className="border-b border-white/[0.04] last:border-0">
                    <td className="py-2.5 pr-4">
                      <span className="block max-w-[320px] truncate font-mono text-[11.5px] text-2">
                        {object.key}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 text-[12px] tabular text-3">{bytes(object.size_bytes)}</td>
                    <td className="py-2.5 pr-4">
                      <Progress
                        value={(object.size_bytes / maxSize) * 100}
                        size="xs"
                        tone="cyan"
                      />
                    </td>
                    <td className="py-2.5 text-right">
                      {idForKey.has(object.key) ? (
                        <Button
                          variant="quiet"
                          size="icon-sm"
                          onClick={() =>
                            setDeleting({
                              id: idForKey.get(object.key).id,
                              name: object.key.split('/').pop(),
                            })
                          }
                          aria-label="Delete object"
                        >
                          🗑
                        </Button>
                      ) : (
                        <Tooltip content="This object belongs to the demo seed, not to your account.">
                          <span className="text-[11px] text-3">seed</span>
                        </Tooltip>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* architecture */}
      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <Card className="p-6">
          <h2 className="text-[15.5px] font-semibold tracking-tight">Architecture layers</h2>
          <p className="mt-0.5 text-[12.5px] text-3">Each layer is a separately scalable unit</p>
          <div className="mt-5 space-y-2">
            {(architecture?.layers || LAYERS).map((layer, index) => {
              const tone = accent(layer.tone || 'violet')
              return (
                <div
                  key={layer.name}
                  className="flex items-center gap-3.5 rounded-xl border border-white/5 bg-white/[0.02] p-3"
                >
                  <span
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[10.5px] font-bold text-white"
                    style={{
                      background: `linear-gradient(135deg, ${tone.hex}, ${tone.hex}33)`,
                      boxShadow: `0 0 16px -6px ${tone.glow}, inset 0 0 0 1px rgba(255,255,255,0.14)`,
                    }}
                  >
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">{layer.name}</p>
                    <p className="truncate text-[11.5px] text-3">
                      {layer.technology || layer.tech} · {layer.responsibility || layer.role}
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        </Card>

        <div className="space-y-4">
          <Card className="p-6">
            <h2 className="text-[15.5px] font-semibold tracking-tight">Request data flow</h2>
            <ol className="mt-4 space-y-2.5">
              {(architecture?.data_flow || DATA_FLOW).map((step, index) => (
                <li key={step} className="flex gap-3">
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-md bg-white/[0.06] text-[10px] font-bold text-2">
                    {index + 1}
                  </span>
                  <span className="text-[12.5px] leading-relaxed text-2">{step}</span>
                </li>
              ))}
            </ol>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[15.5px] font-semibold tracking-tight">Cloud service providers</h2>
              <Button variant="quiet" size="icon-sm" onClick={() => copy(JSON.stringify(architecture, null, 2))} aria-label="Copy architecture JSON">
                {copied ? '✓' : '⧉'}
              </Button>
            </div>
            <div className="mt-4 space-y-3">
              {[
                ['Identity', architecture?.current_providers?.identity],
                ['Database', architecture?.current_providers?.database],
                ['Object storage', architecture?.current_providers?.storage],
              ].map(([label, provider]) =>
                provider ? (
                  <div key={label} className="surface-2 rounded-xl p-3.5">
                    <p className="text-[11px] uppercase tracking-wider text-3">{label}</p>
                    <p className="mt-1 text-[13px] font-semibold">{provider.service}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {(provider.features || []).slice(0, 3).map((feature) => (
                        <Badge key={feature} tone="slate" size="sm">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                ) : null,
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[15.5px] font-semibold tracking-tight">Security controls</h2>
            <div className="mt-4 space-y-2.5 text-[12.5px] text-2">
              {[
                'Passwords hashed with PBKDF2-HMAC-SHA256 (210,000 iterations)',
                'Stateless JWT verification — no session store, any replica can serve',
                'Ownership enforced server-side on every mutation',
                'Uploads validated by declared type, extension, magic bytes and decode',
                'Private objects reachable only through expiring signed URLs',
                'Fixed-window rate limiting, stricter on auth routes',
                'CSP, nosniff, frame-deny and HSTS headers on every response',
              ].map((item) => (
                <div key={item} className="flex gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  {item}
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title="Delete this object?"
        message="The bytes are removed from the bucket immediately. This cannot be undone."
        confirmLabel="Delete object"
      />
    </Page>
  )
}
