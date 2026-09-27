/** Domain constants shared across the UI. Mirrors the backend vocabularies. */

export const CATEGORIES = [
  { id: 'music', label: 'Music', icon: '🎵', accent: 'amber' },
  { id: 'photography', label: 'Photography', icon: '📷', accent: 'violet' },
  { id: 'coding', label: 'Coding', icon: '💻', accent: 'sky' },
  { id: 'art', label: 'Art & Design', icon: '🎨', accent: 'pink' },
  { id: 'fitness', label: 'Fitness', icon: '🏋️', accent: 'emerald' },
  { id: 'cooking', label: 'Cooking', icon: '🍳', accent: 'orange' },
  { id: 'language', label: 'Language', icon: '🗣️', accent: 'rose' },
  { id: 'writing', label: 'Writing', icon: '✍️', accent: 'indigo' },
  { id: 'reading', label: 'Reading', icon: '📚', accent: 'teal' },
  { id: 'gaming', label: 'Gaming', icon: '🎮', accent: 'fuchsia' },
  { id: 'gardening', label: 'Gardening', icon: '🌱', accent: 'lime' },
  { id: 'dance', label: 'Dance', icon: '💃', accent: 'purple' },
  { id: 'chess', label: 'Chess', icon: '♟️', accent: 'slate' },
  { id: 'design', label: 'Design', icon: '🖌️', accent: 'cyan' },
  { id: 'business', label: 'Business', icon: '📈', accent: 'blue' },
  { id: 'other', label: 'Other', icon: '✨', accent: 'violet' },
]

export const CATEGORY_MAP = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]))

/** Tailwind class sets per accent, so cards stay consistent wherever they render. */
export const ACCENTS = {
  violet: {
    text: 'text-violet-300',
    bg: 'bg-violet-500/12',
    border: 'border-violet-400/25',
    ring: 'ring-violet-400/30',
    gradient: 'from-violet-500 to-indigo-600',
    hex: '#8b5cf6',
    solid: '#8b5cf6',
    glow: 'rgba(139,92,246,0.45)',
  },
  indigo: { text: 'text-indigo-300', bg: 'bg-indigo-500/12', border: 'border-indigo-400/25', ring: 'ring-indigo-400/30', gradient: 'from-indigo-500 to-blue-600', hex: '#6366f1', solid: '#6366f1', glow: 'rgba(99,102,241,0.45)' },
  sky: { text: 'text-sky-300', bg: 'bg-sky-500/12', border: 'border-sky-400/25', ring: 'ring-sky-400/30', gradient: 'from-sky-500 to-cyan-500', hex: '#0ea5e9', solid: '#0ea5e9', glow: 'rgba(14,165,233,0.45)' },
  cyan: { text: 'text-cyan-300', bg: 'bg-cyan-500/12', border: 'border-cyan-400/25', ring: 'ring-cyan-400/30', gradient: 'from-cyan-400 to-teal-500', hex: '#06b6d4', solid: '#06b6d4', glow: 'rgba(6,182,212,0.45)' },
  emerald: { text: 'text-emerald-300', bg: 'bg-emerald-500/12', border: 'border-emerald-400/25', ring: 'ring-emerald-400/30', gradient: 'from-emerald-500 to-teal-600', hex: '#10b981', solid: '#10b981', glow: 'rgba(16,185,129,0.45)' },
  teal: { text: 'text-teal-300', bg: 'bg-teal-500/12', border: 'border-teal-400/25', ring: 'ring-teal-400/30', gradient: 'from-teal-400 to-emerald-500', hex: '#14b8a6', solid: '#14b8a6', glow: 'rgba(20,184,166,0.45)' },
  amber: { text: 'text-amber-300', bg: 'bg-amber-500/12', border: 'border-amber-400/25', ring: 'ring-amber-400/30', gradient: 'from-amber-400 to-orange-500', hex: '#f59e0b', solid: '#f59e0b', glow: 'rgba(245,158,11,0.45)' },
  orange: { text: 'text-orange-300', bg: 'bg-orange-500/12', border: 'border-orange-400/25', ring: 'ring-orange-400/30', gradient: 'from-orange-400 to-amber-500', hex: '#fb923c', solid: '#fb923c', glow: 'rgba(251,146,60,0.45)' },
  rose: { text: 'text-rose-300', bg: 'bg-rose-500/12', border: 'border-rose-400/25', ring: 'ring-rose-400/30', gradient: 'from-rose-400 to-pink-600', hex: '#f43f5e', solid: '#f43f5e', glow: 'rgba(244,63,94,0.45)' },
  pink: { text: 'text-pink-300', bg: 'bg-pink-500/12', border: 'border-pink-400/25', ring: 'ring-pink-400/30', gradient: 'from-pink-400 to-fuchsia-600', hex: '#ec4899', solid: '#ec4899', glow: 'rgba(236,72,153,0.45)' },
  fuchsia: { text: 'text-fuchsia-300', bg: 'bg-fuchsia-500/12', border: 'border-fuchsia-400/25', ring: 'ring-fuchsia-400/30', gradient: 'from-fuchsia-400 to-purple-600', hex: '#d946ef', solid: '#d946ef', glow: 'rgba(217,70,239,0.45)' },
  purple: { text: 'text-purple-300', bg: 'bg-purple-500/12', border: 'border-purple-400/25', ring: 'ring-purple-400/30', gradient: 'from-purple-400 to-violet-600', hex: '#a855f7', solid: '#a855f7', glow: 'rgba(168,85,247,0.45)' },
  lime: { text: 'text-lime-300', bg: 'bg-lime-500/12', border: 'border-lime-400/25', ring: 'ring-lime-400/30', gradient: 'from-lime-400 to-green-500', hex: '#84cc16', solid: '#84cc16', glow: 'rgba(132,204,22,0.45)' },
  blue: { text: 'text-blue-300', bg: 'bg-blue-500/12', border: 'border-blue-400/25', ring: 'ring-blue-400/30', gradient: 'from-blue-400 to-indigo-600', hex: '#3b82f6', solid: '#3b82f6', glow: 'rgba(59,130,246,0.45)' },
  slate: { text: 'text-slate-300', bg: 'bg-slate-500/12', border: 'border-slate-400/25', ring: 'ring-slate-400/30', gradient: 'from-slate-400 to-slate-600', hex: '#94a3b8', solid: '#94a3b8', glow: 'rgba(148,163,184,0.45)' },
}

export const accent = (name) => ACCENTS[name] || ACCENTS.violet

export const LEVELS = [
  { id: 'BEGINNER', label: 'Beginner', hint: '0–10 hours' },
  { id: 'INTERMEDIATE', label: 'Intermediate', hint: '10–40 hours' },
  { id: 'ADVANCED', label: 'Advanced', hint: '40+ hours' },
]

export const SKILL_STATUSES = [
  { id: 'ACTIVE', label: 'Active', tone: 'emerald' },
  { id: 'PAUSED', label: 'Paused', tone: 'amber' },
  { id: 'COMPLETED', label: 'Completed', tone: 'sky' },
]

export const STATUS_TONE = { ACTIVE: 'emerald', PAUSED: 'amber', COMPLETED: 'sky' }

export const SKILL_ICONS = [
  '🎸', '🎹', '🎤', '🎧', '📷', '🎞️', '🖌️', '🎨', '💻', '⌨️', '🧠', '📐',
  '🏃', '🏋️', '🧘', '⚽', '🍳', '🍞', '🗣️', '📚', '✍️', '🎮', '♟️', '🌱',
  '🕺', '🎬', '🧵', '🔧', '💰', '🧘‍♀️', '🚴', '🏊', '🥊', '🎯', '🌊', '🐕',
]

export const MOODS = [
  { id: 'rough', label: 'Rough', icon: '😖' },
  { id: 'okay', label: 'Okay', icon: '😐' },
  { id: 'good', label: 'Good', icon: '🙂' },
  { id: 'great', label: 'Great', icon: '😄' },
  { id: 'flow', label: 'In flow', icon: '🤩' },
]

export const GOAL_UNITS = [
  { id: 'minutes', label: 'Minutes', short: 'min' },
  { id: 'hours', label: 'Hours', short: 'h' },
  { id: 'sessions', label: 'Sessions', short: 'sessions' },
  { id: 'pieces', label: 'Pieces', short: 'pieces' },
  { id: 'pages', label: 'Pages', short: 'pages' },
  { id: 'km', label: 'Kilometres', short: 'km' },
  { id: 'reps', label: 'Reps', short: 'reps' },
]

export const QUICK_LOG_MINUTES = [10, 15, 20, 30, 45, 60, 90, 120]

export const INTERESTS = [
  'music', 'photography', 'coding', 'art', 'fitness', 'cooking',
  'language', 'writing', 'reading', 'gaming', 'gardening', 'design',
]

/** Community feed filters shown as pills. */
export const FEED_FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'music', label: 'Music' },
  { id: 'photography', label: 'Photography' },
  { id: 'coding', label: 'Coding' },
  { id: 'art', label: 'Art' },
  { id: 'fitness', label: 'Fitness' },
  { id: 'cooking', label: 'Cooking' },
  { id: 'writing', label: 'Writing' },
  { id: 'reading', label: 'Reading' },
  { id: 'design', label: 'Design' },
  { id: 'other', label: 'Other' },
]

export const BADGE_TONE = {
  bronze: 'from-amber-700/70 to-amber-500/40',
  silver: 'from-slate-500/70 to-slate-300/30',
  gold: 'from-yellow-600/70 to-amber-300/40',
}
