import { Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Page } from '../components/Background'
import { Button, Card, EmptyState } from '../components/ui'

export default function NotFound() {
  const { isAuthenticated } = useAuth()
  const primaryTo = isAuthenticated ? '/app' : '/login'

  return (
    <Page className="space-y-6">
      <div className="grid min-h-[68vh] place-items-center py-10">
        <Card className="w-full max-w-2xl overflow-hidden">
          <div className="bg-brand-gradient py-1.5 text-center text-[10.5px] font-bold uppercase tracking-[0.32em] text-white">
            Error 404
          </div>
          <p className="px-6 pt-9 text-center font-display text-[68px] font-bold leading-none tracking-tight text-gradient sm:text-[92px]">
            404
          </p>
          <EmptyState
            className="pt-4"
            icon="🧘"
            title="This page took a practice break"
            message="We looked everywhere and came back empty-handed. Rest is part of the work — pick up where you left off and log a session."
            action={
              <div className="flex flex-wrap items-center justify-center gap-2.5">
                <Link to={primaryTo}>
                  <Button variant="primary" size="lg">
                    Back to dashboard
                  </Button>
                </Link>
                <Link to="/">
                  <Button variant="ghost" size="lg">
                    Go home
                  </Button>
                </Link>
              </div>
            }
          />
          <p className="px-6 pb-7 text-center text-[12.5px] text-3">
            If you followed a link from inside the app, that page may have been renamed.
          </p>
        </Card>
      </div>
    </Page>
  )
}
