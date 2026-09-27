import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Small data-fetching hook.
 *
 * Deliberately tiny: it handles the two things every screen in this app needs
 * (loading + error + refetch) without pulling in a caching library, and it
 * ignores responses from superseded requests so a fast filter change can never
 * be overwritten by a slower earlier response.
 */
export function useAsync(fn, deps = [], { immediate = true } = {}) {
  const [state, setState] = useState({ data: null, loading: immediate, error: null })
  const requestId = useRef(0)
  const mounted = useRef(true)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const run = useCallback(async () => {
    const id = ++requestId.current
    setState((current) => ({ ...current, loading: true, error: null }))
    try {
      const data = await fn()
      if (mounted.current && id === requestId.current) {
        setState({ data, loading: false, error: null })
      }
      return data
    } catch (error) {
      if (mounted.current && id === requestId.current) {
        setState({ data: null, loading: false, error })
      }
      return null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  useEffect(() => {
    if (immediate) run()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run, immediate])

  return { ...state, refetch: run, setData: (data) => setState((s) => ({ ...s, data })) }
}

/** Delay a rapidly-changing value (search boxes). */
export function useDebounced(value, delay = 350) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

/** Persist a piece of UI state (filters, sort, view mode) across reloads. */
export function useStoredState(key, initial) {
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : JSON.parse(raw)
    } catch {
      return initial
    }
  })
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      /* quota or private mode - non-fatal */
    }
  }, [key, value])
  return [value, setValue]
}

/** Close on outside click / Escape - used by every popover and dropdown. */
export function useDismiss(ref, onDismiss, active = true) {
  useEffect(() => {
    if (!active) return undefined
    const onClick = (event) => {
      if (ref.current && !ref.current.contains(event.target)) onDismiss()
    }
    const onKey = (event) => {
      if (event.key === 'Escape') onDismiss()
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [ref, onDismiss, active])
}

/** Track a media query (responsive behaviour without a resize listener). */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(query).matches : false,
  )
  useEffect(() => {
    const list = window.matchMedia(query)
    const handler = (event) => setMatches(event.matches)
    setMatches(list.matches)
    list.addEventListener('change', handler)
    return () => list.removeEventListener('change', handler)
  }, [query])
  return matches
}
