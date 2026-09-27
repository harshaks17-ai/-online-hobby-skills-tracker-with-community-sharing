/**
 * API client.
 *
 * Responsibilities
 *  - single place that knows the base URL
 *  - attaches the bearer token
 *  - transparently refreshes an expired access token exactly once, then replays
 *    the original request (this is why the app never bounces the user to the
 *    login screen because their token aged out mid-session)
 *  - normalises every error into an `ApiError` the UI can render
 */

const BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '')

const ACCESS_KEY = 'hobbylog.access'
const REFRESH_KEY = 'hobbylog.refresh'

export class ApiError extends Error {
  constructor({ code, message, status, details }) {
    super(message || 'Something went wrong.')
    this.name = 'ApiError'
    this.code = code || 'unknown_error'
    this.status = status || 0
    this.details = details || {}
  }
}

/* ------------------------------------------------------------------ tokens */
export const tokenStore = {
  get access() {
    return localStorage.getItem(ACCESS_KEY)
  },
  get refresh() {
    return localStorage.getItem(REFRESH_KEY)
  },
  set({ access_token, refresh_token }) {
    if (access_token) localStorage.setItem(ACCESS_KEY, access_token)
    if (refresh_token) localStorage.setItem(REFRESH_KEY, refresh_token)
  },
  clear() {
    localStorage.removeItem(ACCESS_KEY)
    localStorage.removeItem(REFRESH_KEY)
  },
}

/* ------------------------------------------------------------------ helpers */
function buildUrl(path, params) {
  const url = `${BASE}${path}`
  if (!params) return url
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return
    search.append(key, String(value))
  })
  const qs = search.toString()
  return qs ? `${url}?${qs}` : url
}

async function parse(response) {
  const type = response.headers.get('content-type') || ''
  if (type.includes('application/json')) return response.json()
  return response.text()
}

function toError(payload, status) {
  if (payload && typeof payload === 'object' && payload.error) {
    return new ApiError({ ...payload.error, status })
  }
  if (payload && typeof payload === 'object' && payload.detail) {
    // FastAPI's own validation shape
    const detail = payload.detail
    const message = Array.isArray(detail)
      ? detail.map((d) => `${(d.loc || []).slice(1).join('.')}: ${d.msg}`).join(' · ')
      : String(detail)
    return new ApiError({ code: 'validation_error', message, status, details: payload })
  }
  return new ApiError({ code: 'http_error', message: `Request failed (${status})`, status })
}

/** Single-flight refresh so a burst of 401s triggers only one refresh call. */
let refreshInFlight = null

async function refreshAccessToken() {
  const refreshToken = tokenStore.refresh
  if (!refreshToken) return false
  if (!refreshInFlight) {
    refreshInFlight = (async () => {
      try {
        const response = await fetch(buildUrl('/api/auth/refresh'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refreshToken }),
        })
        if (!response.ok) return false
        const data = await response.json()
        tokenStore.set(data)
        return Boolean(data.access_token)
      } catch {
        return false
      } finally {
        // release the lock on the next tick so queued callers see the result
        setTimeout(() => {
          refreshInFlight = null
        }, 0)
      }
    })()
  }
  return refreshInFlight
}

async function request(method, path, { body, params, auth = true, raw, formData, retry = true } = {}) {
  const headers = {}
  let payload
  if (formData) {
    payload = formData
  } else if (raw) {
    payload = raw
  } else if (body !== undefined) {
    headers['Content-Type'] = 'application/json'
    payload = JSON.stringify(body)
  }
  if (auth && tokenStore.access) headers.Authorization = `Bearer ${tokenStore.access}`

  let response
  try {
    const options = { method, headers }
    if (payload !== undefined && method !== 'GET' && method !== 'HEAD') options.body = payload
    response = await fetch(buildUrl(path, params), options)
  } catch {
    throw new ApiError({
      code: 'network_error',
      message: 'Cannot reach the server. Check your connection and try again.',
      status: 0,
    })
  }

  if (response.status === 401 && auth && retry && tokenStore.refresh) {
    const refreshed = await refreshAccessToken()
    if (refreshed) {
      return request(method, path, { body, params, auth, raw, formData, retry: false })
    }
    tokenStore.clear()
  }

  const data = await parse(response)
  if (!response.ok) throw toError(data, response.status)
  return data
}

/* -------------------------------------------------------------------- verbs */
export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body, options) => request('POST', path, { body, ...options }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path, options) => request('DELETE', path, options),
  upload: (path, file, fields = {}) => {
    const form = new FormData()
    form.append('file', file)
    Object.entries(fields).forEach(([key, value]) => form.append(key, value))
    return request('POST', path, { formData: form })
  },
}

/* -------------------------------------------------------- endpoint helpers  */
export const authApi = {
  me: () => api.get('/api/auth/me'),
  login: (payload) => api.post('/api/auth/login', payload, { auth: false }),
  register: (payload) => api.post('/api/auth/register', payload, { auth: false }),
  logout: () => api.post('/api/auth/logout').catch(() => null),
  profile: () => api.get('/api/profile'),
  updateProfile: (payload) => api.put('/api/profile', payload),
  changePassword: (payload) => api.post('/api/profile/password', payload),
  summary: () => api.get('/api/profile/summary'),
  exportData: () => api.get('/api/analytics/export'),
}

export const skillsApi = {
  list: (params) => api.get('/api/skills', params),
  get: (id) => api.get(`/api/skills/${id}`),
  create: (payload) => api.post('/api/skills', payload),
  update: (id, payload) => api.put(`/api/skills/${id}`, payload),
  remove: (id) => api.del(`/api/skills/${id}`),
  discover: (params) => api.get('/api/skills/discover', params),
  categories: () => api.get('/api/skills/categories'),
}

export const practiceApi = {
  log: (payload) => api.post('/api/practice', payload),
  list: (params) => api.get('/api/practice', params),
  streak: () => api.get('/api/practice/streak'),
  update: (id, payload) => api.put(`/api/practice/${id}`, payload),
  remove: (id) => api.del(`/api/practice/${id}`),
}

export const goalsApi = {
  list: (params) => api.get('/api/goals', params),
  get: (id) => api.get(`/api/goals/${id}`),
  create: (payload) => api.post('/api/goals', payload),
  update: (id, payload) => api.put(`/api/goals/${id}`, payload),
  remove: (id) => api.del(`/api/goals/${id}`),
  rebuild: (id) => api.post(`/api/goals/${id}/rebuild`),
  achievements: () => api.get('/api/goals/achievements'),
}

export const communityApi = {
  feed: (params) => api.get('/api/feed', params),
  post: (payload) => api.post('/api/posts', payload),
  updatePost: (id, payload) => api.put(`/api/posts/${id}`, payload),
  removePost: (id) => api.del(`/api/posts/${id}`),
  getPost: (id) => api.get(`/api/posts/${id}`),
  like: (id) => api.post(`/api/posts/${id}/like`),
  unlike: (id) => api.del(`/api/posts/${id}/like`),
  toggleLike: (id) => api.post(`/api/posts/${id}/toggle-like`),
  comment: (id, payload) => api.post(`/api/posts/${id}/comments`, payload),
  comments: (id, params) => api.get(`/api/posts/${id}/comments`, params),
  removeComment: (id) => api.del(`/api/comments/${id}`),
  likers: (id) => api.get(`/api/posts/${id}/likes`),
  report: (payload) => api.post('/api/community/reports', payload),
  stats: () => api.get('/api/community/stats'),
  trending: () => api.get('/api/community/trending'),
  trendingSkills: () => api.get('/api/community/trending-skills'),
  categories: () => api.get('/api/community/categories'),
  activity: () => api.get('/api/community/activity'),
  overview: () => api.get('/api/community/overview'),
  leaderboard: (params) => api.get('/api/users/leaderboard', params),
}

export const usersApi = {
  search: (q) => api.get('/api/users/search', { q }),
  profile: (username) => api.get(`/api/users/${username}`),
  follow: (username) => api.post(`/api/users/${username}/follow`),
  unfollow: (username) => api.del(`/api/users/${username}/follow`),
  followers: (username) => api.get(`/api/users/${username}/followers`),
  following: (username) => api.get(`/api/users/${username}/following`),
  myFollowers: () => api.get('/api/users/me/followers'),
  myFollowing: () => api.get('/api/users/me/following'),
  deleteAccount: () => api.del('/api/users/me'),
}

export const analyticsApi = {
  dashboard: () => api.get('/api/analytics/dashboard'),
  badges: () => api.get('/api/analytics/badges'),
  levels: () => api.get('/api/analytics/levels'),
}

export const filesApi = {
  list: (params) => api.get('/api/files', params),
  bucket: () => api.get('/api/files/bucket'),
  remove: (id) => api.del(`/api/files/${id}`),
}

export const platformApi = {
  health: () => api.get('/api/health'),
  config: () => api.get('/api/meta/config'),
  architecture: () => api.get('/api/meta/architecture'),
  notifications: () => api.get('/api/notifications'),
  markNotificationsRead: () => api.post('/api/notifications/read'),
}

export default api
