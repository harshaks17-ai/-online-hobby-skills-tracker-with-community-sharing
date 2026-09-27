import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'

import { AuthProvider, useAuth } from './context/AuthContext'
import { ThemeProvider } from './context/ThemeContext'
import { ToastProvider } from './context/ToastContext'
import { Background } from './components/Background'
import { AppShell } from './components/layout/AppShell'
import { Button, LoadingScreen } from './components/ui'

/* Landing + auth are eager (first paint), everything else is code-split so the
   initial bundle stays small. */
import Landing from './pages/Landing'
import Login from './pages/Login'
import Register from './pages/Register'

const Dashboard = lazy(() => import('./pages/Dashboard'))
const Skills = lazy(() => import('./pages/Skills'))
const SkillDetail = lazy(() => import('./pages/SkillDetail'))
const Practice = lazy(() => import('./pages/Practice'))
const Goals = lazy(() => import('./pages/Goals'))
const Feed = lazy(() => import('./pages/Feed'))
const Discover = lazy(() => import('./pages/Discover'))
const Leaderboard = lazy(() => import('./pages/Leaderboard'))
const Analytics = lazy(() => import('./pages/Analytics'))
const CloudConsole = lazy(() => import('./pages/CloudConsole'))
const Settings = lazy(() => import('./pages/Settings'))
const Profile = lazy(() => import('./pages/Profile'))
const NotFound = lazy(() => import('./pages/NotFound'))

/** Signed-in users never see the marketing/auth screens. */
function PublicOnly({ children }) {
  const { isAuthenticated, booting } = useAuth()
  if (booting) return <FullPageLoader />
  if (isAuthenticated) return <Navigate to="/app" replace />
  return children
}

/** Everything under /app requires a valid token. */
function Protected({ children }) {
  const { isAuthenticated, booting } = useAuth()
  const location = useLocation()
  if (booting) return <FullPageLoader />
  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <AppShell>{children}</AppShell>
}

function FullPageLoader() {
  return (
    <div className="grid min-h-screen place-items-center">
      <LoadingScreen label="Starting HobbyLog" />
    </div>
  )
}

function AnimatedRoutes() {
  const location = useLocation()
  const isMarketing = ['/', '/login', '/register'].includes(location.pathname)
  return (
    <>
      <Background variant={isMarketing ? 'marketing' : 'app'} />
      <AnimatePresence mode="wait">
        <motion.div
          key={location.pathname}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
        >
          <Routes location={location}>
            <Route path="/" element={<Landing />} />
            <Route
              path="/login"
              element={
                <PublicOnly>
                  <Login />
                </PublicOnly>
              }
            />
            <Route
              path="/register"
              element={
                <PublicOnly>
                  <Register />
                </PublicOnly>
              }
            />

            <Route path="/app" element={<Protected><Dashboard /></Protected>} />
            <Route path="/app/skills" element={<Protected><Skills /></Protected>} />
            <Route path="/app/skills/:id" element={<Protected><SkillDetail /></Protected>} />
            <Route path="/app/practice" element={<Protected><Practice /></Protected>} />
            <Route path="/app/goals" element={<Protected><Goals /></Protected>} />
            <Route path="/app/feed" element={<Protected><Feed /></Protected>} />
            <Route path="/app/discover" element={<Protected><Discover /></Protected>} />
            <Route path="/app/leaderboard" element={<Protected><Leaderboard /></Protected>} />
            <Route path="/app/analytics" element={<Protected><Analytics /></Protected>} />
            <Route path="/app/cloud" element={<Protected><CloudConsole /></Protected>} />
            <Route path="/app/settings" element={<Protected><Settings /></Protected>} />

            <Route path="/u/:username" element={<Profile />} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </motion.div>
      </AnimatePresence>
    </>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <ToastProvider>
        <AuthProvider>
          <Suspense
            fallback={
              <div className="grid min-h-[70vh] place-items-center">
                <LoadingScreen />
              </div>
            }
          >
            <AnimatedRoutes />
          </Suspense>
        </AuthProvider>
      </ToastProvider>
    </ThemeProvider>
  )
}

export { Button }
