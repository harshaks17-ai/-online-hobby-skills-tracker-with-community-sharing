/**
 * Chart library.
 *
 * Hand-built on SVG + framer-motion rather than a charting dependency, because
 * every chart here has to animate on data change, respect the app's accent
 * palette, and stay crisp on a dark surface. Recharts is still installed for
 * the heavier analytics views.
 */
import { useId, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { accent } from '../../lib/constants'
import { compactNumber, humanMinutes, shortDate } from '../../lib/format'

/* --------------------------------------------------------------- AreaChart */
export function AreaChart({
  data = [],
  xKey = 'label',
  yKey = 'minutes',
  height = 220,
  tone = 'violet',
  formatValue = humanMinutes,
  formatTick,
  showGrid = true,
  gradientId,
}) {
  const [hover, setHover] = useState(null)
  const uid = useId().replace(/:/g, '')
  const gid = gradientId || `grad-${uid}`
  const width = 720
  const pad = { top: 16, right: 12, bottom: 26, left: 40 }
  const hex = accent(tone).hex

  const points = useMemo(() => {
    if (!data.length) return { coords: [], max: 0, total: 0, area: '', line: '' }
    const max = Math.max(...data.map((d) => Number(d[yKey]) || 0), 1)
    const innerW = width - pad.left - pad.right
    const innerH = height - pad.top - pad.bottom
    const stepX = data.length > 1 ? innerW / (data.length - 1) : 0
    const coords = data.map((d, i) => ({
      x: pad.left + stepX * i,
      y: pad.top + innerH - (Number(d[yKey]) || 0) / max * innerH,
      raw: d,
      value: Number(d[yKey]) || 0,
    }))
    // Catmull-Rom -> cubic bezier smoothing
    let line = `M ${coords[0].x} ${coords[0].y}`
    for (let i = 0; i < coords.length - 1; i += 1) {
      const p0 = coords[i - 1] || coords[i]
      const p1 = coords[i]
      const p2 = coords[i + 1]
      const p3 = coords[i + 2] || p2
      const c1x = p1.x + (p2.x - p0.x) / 6
      const c1y = p1.y + (p2.y - p0.y) / 6
      const c2x = p2.x - (p3.x - p1.x) / 6
      const c2y = p2.y - (p3.y - p1.y) / 6
      line += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`
    }
    const area = `${line} L ${coords[coords.length - 1].x} ${pad.top + innerH} L ${coords[0].x} ${
      pad.top + innerH
    } Z`
    return { coords, max, area, line, total: data.reduce((sum, d) => sum + (Number(d[yKey]) || 0), 0) }
  }, [data, xKey, yKey, height])

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => points.max * t)

  if (!data.length) {
    return (
      <div className="grid h-[220px] place-items-center rounded-xl bg-white/[0.02] text-[13px] text-3">
        No data yet — log a session to see this chart come alive.
      </div>
    )
  }

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={hex} stopOpacity="0.42" />
            <stop offset="60%" stopColor={hex} stopOpacity="0.12" />
            <stop offset="100%" stopColor={hex} stopOpacity="0" />
          </linearGradient>
          <filter id={`${gid}-glow`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="6" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {showGrid &&
          ticks.map((tick, i) => {
            const y = pad.top + (height - pad.top - pad.bottom) * (1 - i / (ticks.length - 1))
            return (
              <g key={i}>
                <line
                  x1={pad.left} x2={width - pad.right} y1={y} y2={y}
                  stroke="rgb(var(--border-1))" strokeWidth="1" strokeDasharray="3 5"
                />
                <text x={pad.left - 8} y={y + 4} textAnchor="end" fontSize="10.5" fill="rgb(var(--text-3))">
                  {formatTick ? formatTick(tick) : compactNumber(tick)}
                </text>
              </g>
            )
          })}

        <motion.path
          d={points.area}
          fill={`url(#${gid})`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.8, delay: 0.25 }}
        />
        <motion.path
          d={points.line}
          fill="none"
          stroke={hex}
          strokeWidth="2.4"
          strokeLinecap="round"
          filter={`url(#${gid}-glow)`}
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
        />

        {points.coords.map((point, i) => (
          <g key={i}>
            <circle
              cx={point.x} cy={point.y} r="14" fill="transparent"
              onMouseEnter={() => setHover(i)}
            />
            <motion.circle
              cx={point.x} cy={point.y} r={hover === i ? 5 : 3}
              fill={hex}
              stroke="rgb(var(--page))" strokeWidth="2"
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.4 + i * 0.03, type: 'spring', stiffness: 300 }}
            />
            {(i === 0 || i === points.coords.length - 1 || i % Math.ceil(data.length / 6) === 0) && (
              <text
                x={point.x} y={height - 8} textAnchor="middle" fontSize="10.5" fill="rgb(var(--text-3))"
              >
                {point.raw[xKey]}
              </text>
            )}
          </g>
        ))}
      </svg>

      {hover !== null && points.coords[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-ink-800 px-3 py-2 text-[12px] shadow-lift ring-1 ring-white/10"
          style={{ left: `${(points.coords[hover].x / width) * 100}%`, top: `${(points.coords[hover].y / height) * 100 - 2}%` }}
        >
          <div className="font-semibold text-white">{formatValue(points.coords[hover].value)}</div>
          <div className="text-[11px] text-3">{points.coords[hover].raw[xKey]}</div>
        </div>
      )}
    </div>
  )
}

/* --------------------------------------------------------------- BarChart */
export function BarChart({
  data = [],
  xKey = 'label',
  yKey = 'value',
  height = 220,
  tone = 'violet',
  formatValue = compactNumber,
  horizontal = false,
}) {
  const [hover, setHover] = useState(null)
  const hex = accent(tone).hex
  const max = Math.max(...data.map((d) => Number(d[yKey]) || 0), 1)

  if (!data.length) {
    return <div className="grid h-[220px] place-items-center rounded-xl bg-white/[0.02] text-[13px] text-3">No data yet.</div>
  }

  if (horizontal) {
    return (
      <div className="space-y-2.5">
        {data.map((row, i) => {
          const value = Number(row[yKey]) || 0
          const pct = (value / max) * 100
          const rowTone = accent(row.accent || tone)
          return (
            <div
              key={row[xKey] ?? i}
              className="group flex items-center gap-3"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <span className="w-28 shrink-0 truncate text-[12.5px] font-medium text-2">
                {row.icon && <span className="mr-1.5">{row.icon}</span>}
                {row[xKey]}
              </span>
              <div className="relative h-7 flex-1 overflow-hidden rounded-lg bg-white/[0.04]">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.75, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                  className="absolute inset-y-0 left-0 rounded-lg"
                  style={{
                    background: `linear-gradient(90deg, ${rowTone.hex}, ${rowTone.hex}88)`,
                    boxShadow: `0 0 18px -4px ${rowTone.glow}`,
                  }}
                />
                {hover === i && (
                  <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[11.5px] font-bold text-white">
                    {formatValue(value)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {data.map((row, i) => {
        const value = Number(row[yKey]) || 0
        const pct = (value / max) * 100
        return (
          <div
            key={row[xKey] ?? i}
            className="group relative flex h-full flex-1 flex-col justify-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            {hover === i && (
              <div className="absolute -top-1 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink-800 px-2 py-1 text-[11px] font-semibold shadow-lift ring-1 ring-white/10">
                {formatValue(value)}
              </div>
            )}
            <motion.div
              initial={{ height: 0 }}
              animate={{ height: `${Math.max(pct, value > 0 ? 4 : 1.5)}%` }}
              transition={{ duration: 0.7, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              className="w-full rounded-t-md"
              style={{
                background: `linear-gradient(180deg, ${hex}, ${hex}33)`,
                boxShadow: hover === i ? `0 0 20px -4px ${accent(tone).glow}` : 'none',
              }}
            />
            <span className="mt-1.5 truncate text-center text-[10.5px] text-3">{row[xKey]}</span>
          </div>
        )
      })}
    </div>
  )
}

/* ------------------------------------------------------------- DonutChart */
export function DonutChart({ data = [], size = 200, thickness = 26, centerLabel, centerValue, tone = 'violet' }) {
  const [hover, setHover] = useState(null)
  const total = data.reduce((sum, d) => sum + (d.value || 0), 0)
  const radius = (size - thickness) / 2
  const circumference = 2 * Math.PI * radius
  let offset = 0

  const segments = data.map((slice, i) => {
    const fraction = total > 0 ? slice.value / total : 0
    const dash = fraction * circumference
    const segment = { ...slice, dash, gap: circumference - dash, offset, index: i }
    offset += dash
    return segment
  })

  if (!total) {
    return (
      <div className="grid place-items-center rounded-full border border-dashed border-white/10 text-[12px] text-3"
        style={{ width: size, height: size }}>
        No data
      </div>
    )
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgb(var(--surface-2))" strokeWidth={thickness} />
        {segments.map((segment) => {
          const color = accent(segment.accent || tone).hex
          return (
            <motion.circle
              key={segment.index}
              cx={size / 2} cy={size / 2} r={radius}
              fill="none"
              stroke={color}
              strokeWidth={hover === segment.index ? thickness + 5 : thickness}
              strokeDasharray={`${segment.dash} ${segment.gap}`}
              strokeDashoffset={-segment.offset}
              strokeLinecap="butt"
              className="cursor-pointer transition-[stroke-width] duration-200"
              opacity={hover === null || hover === segment.index ? 1 : 0.35}
              onMouseEnter={() => setHover(segment.index)}
              onMouseLeave={() => setHover(null)}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: hover === null || hover === segment.index ? 1 : 0.35, scale: 1 }}
              style={{ transformOrigin: 'center', filter: hover === segment.index ? `drop-shadow(0 0 8px ${color}99)` : 'none' }}
              transition={{ duration: 0.5, delay: segment.index * 0.07 }}
            />
          )
        })}
      </svg>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        {hover !== null ? (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-3">{segments[hover].label}</div>
            <div className="text-2xl font-bold tabular">
              {Math.round((segments[hover].value / total) * 100)}%
            </div>
            <div className="text-[11.5px] text-2">{formatSlice(segments[hover].value)}</div>
          </div>
        ) : (
          <div>
            <div className="text-[11px] uppercase tracking-wider text-3">{centerLabel}</div>
            <div className="text-2xl font-bold tabular">{centerValue ?? formatSlice(total)}</div>
          </div>
        )}
      </div>
    </div>
  )
}

function formatSlice(value) {
  if (value >= 60) return humanMinutes(value)
  return compactNumber(value)
}

/* ---------------------------------------------------------------- Heatmap */
export function Heatmap({ data = [], weeks = 26, tone = 'violet' }) {
  const [hover, setHover] = useState(null)
  const hex = accent(tone).hex
  const max = Math.max(...data.map((d) => d.minutes || 0), 1)

  const columns = useMemo(() => {
    const cols = []
    for (let i = 0; i < weeks; i += 1) cols.push([])
    data.forEach((day, index) => {
      const col = Math.floor(index / 7)
      if (col < weeks) cols[col].push(day)
    })
    return cols
  }, [data, weeks])

  const level = (minutes) => {
    if (!minutes) return 0
    const ratio = minutes / max
    if (ratio > 0.75) return 4
    if (ratio > 0.5) return 3
    if (ratio > 0.25) return 2
    return 1
  }

  const opacities = [0.05, 0.22, 0.45, 0.7, 1]

  return (
    <div className="relative">
      <div className="flex gap-[3px] overflow-x-auto pb-1 no-scrollbar">
        {columns.map((column, ci) => (
          <div key={ci} className="flex flex-col gap-[3px]">
            {Array.from({ length: 7 }).map((_, ri) => {
              const day = column[ri]
              if (!day) return <div key={ri} className="h-[11px] w-[11px]" />
              const l = day.future ? -1 : level(day.minutes)
              return (
                <motion.div
                  key={ri}
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: ci * 0.012 + ri * 0.006, duration: 0.3 }}
                  onMouseEnter={() => setHover(day)}
                  onMouseLeave={() => setHover(null)}
                  className="h-[11px] w-[11px] cursor-pointer rounded-[3px] transition-transform hover:scale-125"
                  style={{
                    background:
                      l < 0
                        ? 'rgb(var(--surface-1))'
                        : l === 0
                          ? 'rgb(var(--surface-2))'
                          : hex,
                    opacity: l < 0 ? 0.4 : opacities[l],
                    outline: hover === day ? `1px solid ${hex}` : 'none',
                  }}
                />
              )
            })}
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center justify-between gap-4">
        <div className="text-[11px] text-3">
          {hover ? (
            <span className="font-semibold text-2">
              {humanMinutes(hover.minutes)} on {shortDate(hover.date)}
            </span>
          ) : (
            `${data.filter((d) => d.minutes > 0).length} active days in the last ${weeks} weeks`
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10.5px] text-3">
          <span>Less</span>
          {[0, 1, 2, 3, 4].map((l) => (
            <span
              key={l}
              className="h-[10px] w-[10px] rounded-[3px]"
              style={{ background: l === 0 ? 'rgb(var(--surface-2))' : hex, opacity: l === 0 ? 1 : opacities[l] }}
            />
          ))}
          <span>More</span>
        </div>
      </div>
    </div>
  )
}

/* -------------------------------------------------------------- Sparkline */
export function Sparkline({ data = [], yKey = 'minutes', width = 120, height = 34, tone = 'violet' }) {
  const hex = accent(tone).hex
  if (!data.length) return <div style={{ width, height }} />
  const max = Math.max(...data.map((d) => Number(d[yKey]) || 0), 1)
  const step = width / Math.max(1, data.length - 1)
  const path = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${i * step} ${height - (Number(d[yKey]) || 0) / max * (height - 4) - 2}`)
    .join(' ')
  return (
    <svg width={width} height={height} className="overflow-visible">
      <path d={`${path} L ${width} ${height} L 0 ${height} Z`} fill={hex} opacity="0.14" />
      <path d={path} fill="none" stroke={hex} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/* --------------------------------------------------------- HourHistogram */
export function HourHistogram({ data = [], height = 130, tone = 'cyan' }) {
  const [hover, setHover] = useState(null)
  const hex = accent(tone).hex
  const max = Math.max(...data.map((d) => d.sessions || 0), 1)
  return (
    <div className="relative">
      <div className="flex items-end gap-[3px]" style={{ height }}>
        {data.map((bucket) => {
          const pct = ((bucket.sessions || 0) / max) * 100
          const night = bucket.hour < 6 || bucket.hour >= 22
          return (
            <div
              key={bucket.hour}
              className="group relative flex-1"
              style={{ height: '100%' }}
              onMouseEnter={() => setHover(bucket)}
              onMouseLeave={() => setHover(null)}
            >
              <motion.div
                initial={{ height: 0 }}
                animate={{ height: `${Math.max(pct, bucket.sessions > 0 ? 6 : 2)}%` }}
                transition={{ duration: 0.55, delay: bucket.hour * 0.012, ease: [0.16, 1, 0.3, 1] }}
                className="absolute bottom-0 w-full rounded-t-[3px]"
                style={{
                  background: night ? 'rgb(var(--surface-3))' : hex,
                  opacity: night ? 1 : 0.35 + (bucket.sessions / max) * 0.65,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-3">
        <span>00</span><span>06</span><span>12</span><span>18</span><span>23</span>
      </div>
      <p className="mt-1 text-center text-[11.5px] text-3">
        {hover ? (
          <>
            <span className="font-semibold text-2">
              {String(hover.hour).padStart(2, '0')}:00
            </span>{' '}
            · {hover.sessions} session{hover.sessions === 1 ? '' : 's'}
          </>
        ) : (
          'When you practise, hour by hour (UTC)'
        )}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------- StackedBar */
export function StackedBar({ segments = [], height = 10, className = '' }) {
  const total = segments.reduce((sum, s) => sum + (s.value || 0), 0) || 1
  return (
    <div className={`flex w-full overflow-hidden rounded-full bg-white/[0.05] ${className}`} style={{ height }}>
      {segments.map((segment, i) => (
        <motion.div
          key={segment.label ?? i}
          initial={{ width: 0 }}
          animate={{ width: `${((segment.value || 0) / total) * 100}%` }}
          transition={{ duration: 0.7, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
          className="h-full"
          style={{ background: accent(segment.accent || 'violet').hex }}
          title={`${segment.label}: ${segment.value}`}
        />
      ))}
    </div>
  )
}

/* ------------------------------------------------------- WeeklyBarChart */
export function DayBars({ data = [], height = 120, tone = 'violet', formatValue = humanMinutes }) {
  const [hover, setHover] = useState(null)
  const hex = accent(tone).hex
  const max = Math.max(...data.map((d) => d.minutes || 0), 1)
  return (
    <div className="no-scrollbar overflow-x-auto pb-1">
      <div className="flex min-w-[540px] items-end gap-2" style={{ height }}>
        {data.map((day, i) => {
          const pct = ((day.minutes || 0) / max) * 100
          const label = new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })
          return (
            <div
              key={day.date}
              className="flex h-full min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            >
              <div className="relative flex w-full flex-1 items-end justify-center">
                <motion.div
                  initial={{ height: 0 }}
                  animate={{ height: `${Math.max(pct, day.minutes > 0 ? 8 : 3)}%` }}
                  transition={{ duration: 0.6, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
                  className="w-full max-w-[26px] rounded-lg"
                  style={{
                    background: `linear-gradient(180deg, ${hex}, ${hex}30)`,
                    boxShadow: day.minutes > 0 ? `0 0 16px -6px ${accent(tone).glow}` : 'none',
                  }}
                />
                {hover === i && (
                  <div className="absolute left-1/2 top-0 z-10 -translate-x-1/2 whitespace-nowrap rounded-lg bg-ink-800 px-2 py-1 text-[10.5px] font-semibold shadow-lift ring-1 ring-white/10">
                    {formatValue(day.minutes)}
                  </div>
                )}
              </div>
              <span className="text-[10.5px] uppercase text-3">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
