import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { communityApi, usersApi } from '../lib/api'
import { useAsync } from '../lib/hooks'
import { compactNumber, humanMinutes, longDate, percentLabel, timeAgo } from '../lib/format'
import { CATEGORY_MAP, STATUS_TONE, accent } from '../lib/constants'
import { Background, Stagger, StaggerItem } from '../components/Background'
import { DonutChart } from '../components/charts'
import {
  Avatar, AvatarStack, Badge, Button, Card, EmptyState, Progress, Segmented,
} from '../components/ui'

export default function Profile() {
  const { username } = useParams()
  const { isAuthenticated } = useAuth()
  const toast = useToast()
  const navigate = useNavigate()
  const [tab, setTab] = useState('skills')
  const [following, setFollowing] = useState(false)
  const [busy, setBusy] = useState(false)

  const { data, loading, refetch } = useAsync(() => usersApi.profile(username), [username])
  const { data: posts } = useAsync(
    () => communityApi.feed({ user_id: data?.user?.id, page_size: 20 }),
    [data?.user?.id],
  )
  const { data: followers } = useAsync(() => usersApi.followers(username), [username])
  const { data: followingList } = useAsync(() => usersApi.following(username), [username])

  useEffect(() => {
    if (data) setFollowing(data.is_following)
  }, [data])

  const profile = data?.user
  const stats = data?.stats || {}
  const skills = data?.skills || []
  const goals = data?.goals || []
  const badges = data?.badges || []
  const isSelf = Boolean(data?.is_self)

  const toggleFollow = async () => {
    if (!isAuthenticated) {
      navigate('/login')
      return
    }
    setBusy(true)
    try {
      const result = following
        ? await usersApi.unfollow(username)
        : await usersApi.follow(username)
      setFollowing(result.data?.following ?? !following)
      toast.success(following ? `Unfollowed @${username}` : `Following @${username}`)
      refetch()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <>
        <Background variant="app" />
        <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
          <div className="skeleton h-56 rounded-2xl" />
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="skeleton h-80 rounded-2xl" />
            <div className="skeleton h-80 rounded-2xl" />
          </div>
        </div>
      </>
    )
  }

  if (!profile) {
    return (
      <>
        <Background variant="app" />
        <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
          <Card>
            <EmptyState
              icon="👤"
              title="Profile not found"
              message={`No account called @${username} exists, or it was deleted.`}
              action={
                <Button variant="primary" onClick={() => navigate('/app')}>
                  Back to dashboard
                </Button>
              }
            />
          </Card>
        </div>
      </>
    )
  }

  const categorySplit = skills.map((skill) => ({
    label: CATEGORY_MAP[skill.category]?.label || skill.category,
    value: skill.total_minutes,
    accent: skill.accent,
  }))

  return (
    <>
      <Background variant="app" />
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:py-12">
        {/* banner */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="card relative overflow-hidden"
        >
          {profile.banner_url ? (
            <img
              src={profile.banner_url}
              alt=""
              className="h-36 w-full object-cover sm:h-52"
            />
          ) : (
            <div className="h-36 w-full bg-brand-gradient sm:h-52" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[rgb(var(--page))] via-transparent to-transparent" />
        </motion.div>

        {/* identity */}
        <Card className="relative -mt-16 p-6 sm:-mt-20 sm:p-8">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="relative">
                <Avatar user={profile} size={112} className="rounded-full ring-4 ring-[rgb(var(--page))]" />
              </div>
              <div className="min-w-0 pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="font-display text-[26px] font-bold leading-tight tracking-tight">
                    {profile.name}
                  </h1>
                  {profile.is_moderator && <Badge tone="sky">Moderator</Badge>}
                  {isSelf && <Badge tone="violet">This is you</Badge>}
                </div>
                <p className="mt-0.5 text-[13.5px] text-3">@{profile.username}</p>
                {profile.bio && (
                  <p className="mt-2.5 max-w-xl text-[13.5px] leading-relaxed text-2">{profile.bio}</p>
                )}
                <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-3">
                  {profile.location && <span>📍 {profile.location}</span>}
                  {profile.website && (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="link-underline text-brand-300 hover:text-brand-200"
                    >
                      🔗 {profile.website.replace(/^https?:\/\//, '')}
                    </a>
                  )}
                  <span>Joined {longDate(profile.created_at)}</span>
                </div>
                {profile.interests?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {profile.interests.map((interest) => (
                      <span key={interest} className="chip capitalize">
                        {interest}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex shrink-0 gap-2.5">
              {isSelf ? (
                <>
                  <Button variant="ghost" onClick={() => navigate('/app/settings')}>
                    Edit profile
                  </Button>
                  <Button variant="primary" onClick={() => navigate('/app/practice?new=1')}>
                    Log practice
                  </Button>
                </>
              ) : (
                <Button variant={following ? 'ghost' : 'primary'} onClick={toggleFollow} loading={busy}>
                  {following ? 'Following ✓' : 'Follow'}
                </Button>
              )}
            </div>
          </div>

          {/* stats */}
          <div className="mt-6 grid grid-cols-2 gap-4 border-t border-white/5 pt-6 sm:grid-cols-5">
            {[
              { label: 'Practice', value: humanMinutes(stats.total_minutes || 0) },
              { label: 'Sessions', value: compactNumber(stats.total_sessions || 0) },
              { label: 'Current streak', value: `${stats.current_streak || 0}d` },
              { label: 'Followers', value: compactNumber(stats.followers_count || 0) },
              { label: 'Updates', value: compactNumber(stats.posts_count || 0) },
            ].map((item) => (
              <div key={item.label} className="text-center sm:text-left">
                <p className="text-[10.5px] uppercase tracking-wider text-3">{item.label}</p>
                <p className="mt-1 font-display text-[20px] font-bold leading-none tabular">{item.value}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* social graph */}
        {(followers?.items?.length > 0 || followingList?.items?.length > 0) && (
          <Card className="mt-4 p-5">
            <div className="flex flex-wrap items-center gap-6">
              {followers?.items?.length > 0 && (
                <div className="flex items-center gap-3">
                  <AvatarStack users={followers.items} max={8} size={28} />
                  <span className="text-[12.5px] text-2">
                    <span className="font-semibold">{followers.items.length}</span> follower
                    {followers.items.length === 1 ? '' : 's'}
                  </span>
                </div>
              )}
              {followingList?.items?.length > 0 && (
                <div className="flex items-center gap-3">
                  <AvatarStack users={followingList.items} max={8} size={28} />
                  <span className="text-[12.5px] text-2">
                    <span className="font-semibold">{followingList.items.length}</span> following
                  </span>
                </div>
              )}
            </div>
          </Card>
        )}

        {/* tabs */}
        <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
          <Segmented
            options={[
              { id: 'skills', label: 'Skills', count: skills.length },
              { id: 'goals', label: 'Goals', count: goals.length },
              { id: 'posts', label: 'Updates', count: posts?.total || 0 },
              { id: 'badges', label: 'Badges', count: badges.length },
            ]}
            value={tab}
            onChange={setTab}
          />
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div>
            {tab === 'skills' && (
              <Stagger className="grid gap-3 sm:grid-cols-2">
                {skills.length === 0 && (
                  <Card className="sm:col-span-2">
                    <EmptyState
                      icon="🎯"
                      title="No public skills"
                      message={isSelf ? 'Mark a skill public to show it here.' : 'This user keeps their skills private.'}
                    />
                  </Card>
                )}
                {skills.map((skill) => (
                  <StaggerItem key={skill.id}>
                    <Card className="p-5">
                      <div className="flex items-start gap-3">
                        <span
                          className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[21px] ring-1 ring-white/10"
                          style={{ background: `${accent(skill.accent).hex}22` }}
                        >
                          {skill.icon}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[14.5px] font-semibold">{skill.title}</div>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11.5px] text-3">
                            <span>{CATEGORY_MAP[skill.category]?.icon}</span>
                            {CATEGORY_MAP[skill.category]?.label}
                          </div>
                        </div>
                        <Badge tone={STATUS_TONE[skill.status] || 'violet'} size="sm">
                          {humanMinutes(skill.total_minutes)}
                        </Badge>
                      </div>
                      {skill.description && (
                        <p className="mt-3 line-clamp-2 text-[12px] leading-relaxed text-3">
                          {skill.description}
                        </p>
                      )}
                      <div className="mt-3">
                        <Progress value={skill.progress_percent} tone={skill.accent} size="xs" showLabel />
                      </div>
                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-3">
                        <span>{skill.session_count} sessions</span>
                        {skill.current_streak > 0 && (
                          <span className="text-amber-300">🔥 {skill.current_streak} day streak</span>
                        )}
                      </div>
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
            )}

            {tab === 'goals' && (
              <Stagger className="grid gap-3 sm:grid-cols-2">
                {goals.length === 0 && (
                  <Card className="sm:col-span-2">
                    <EmptyState icon="🏁" title="No completed goals yet" message="Goals appear here once they are finished." />
                  </Card>
                )}
                {goals.map((goal) => (
                  <StaggerItem key={goal.id}>
                    <Card className="p-5">
                      <div className="flex items-center gap-2">
                        {goal.skill_icon && <span>{goal.skill_icon}</span>}
                        <span className="min-w-0 flex-1 truncate text-[14px] font-semibold">{goal.title}</span>
                        <Badge tone="emerald" size="sm">
                          ✓ {percentLabel(goal.progress_percent)}%
                        </Badge>
                      </div>
                      <p className="mt-1.5 text-[12px] text-3">
                        {goal.current_value} / {goal.target_value} {goal.unit}
                      </p>
                      <div className="mt-3">
                        <Progress value={100} tone="emerald" size="sm" />
                      </div>
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
            )}

            {tab === 'posts' && (
              <Stagger className="space-y-3">
                {(posts?.items || []).length === 0 && (
                  <Card>
                    <EmptyState icon="💬" title="No updates yet" message="Shared practice updates appear here." />
                  </Card>
                )}
                {(posts?.items || []).map((post) => (
                  <StaggerItem key={post.id}>
                    <Card className="p-5">
                      <div className="flex items-center gap-2 text-[12px] text-3">
                        {post.skill_icon && <span>{post.skill_icon}</span>}
                        <span className="font-semibold text-2">{post.skill_title}</span>
                        <span>· {timeAgo(post.created_at)}</span>
                      </div>
                      <p className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-1">
                        {post.content}
                      </p>
                      {post.media_url && (
                        <img
                          src={post.media_url}
                          alt=""
                          loading="lazy"
                          className="mt-3 max-h-72 w-full rounded-xl object-cover ring-1 ring-white/10"
                        />
                      )}
                      <div className="mt-3 flex items-center gap-4 text-[12px] text-3">
                        <span>❤️ {post.likes_count}</span>
                        <span>💬 {post.comments_count}</span>
                      </div>
                    </Card>
                  </StaggerItem>
                ))}
              </Stagger>
            )}

            {tab === 'badges' && (
              <Card className="p-6">
                <h3 className="text-[14.5px] font-semibold">Unlocked badges</h3>
                {badges.length === 0 ? (
                  <p className="mt-3 text-[12.5px] text-3">No badges yet.</p>
                ) : (
                  <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                    {badges.map((badge) => (
                      <div
                        key={badge.code}
                        className="rounded-xl border border-amber-300/20 bg-amber-400/[0.06] p-3 text-center"
                      >
                        <div className="text-[24px]">{badge.icon}</div>
                        <div className="mt-1 text-[12px] font-semibold">{badge.title}</div>
                        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-3">{badge.tier}</div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </div>

          {/* side panel */}
          <aside className="space-y-4">
            {categorySplit.length > 0 && (
              <Card className="p-5">
                <h3 className="text-[14px] font-semibold">Practice mix</h3>
                <div className="mt-4 flex flex-col items-center gap-4">
                  <DonutChart data={categorySplit} size={150} centerLabel="total" centerValue={humanMinutes(stats.total_minutes || 0)} />
                  <div className="w-full space-y-1.5">
                    {categorySplit.slice(0, 6).map((item) => (
                      <div key={item.label} className="flex items-center gap-2 text-[12px]">
                        <span className="h-2 w-2 shrink-0 rounded-sm" style={{ background: accent(item.accent).hex }} />
                        <span className="min-w-0 flex-1 truncate text-2">{item.label}</span>
                        <span className="shrink-0 tabular text-3">{humanMinutes(item.value)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )}

            {isSelf && (
              <Card className="p-5">
                <h3 className="text-[14px] font-semibold">Your public link</h3>
                <p className="mt-1.5 text-[12px] text-3">Share your progress with anyone.</p>
                <Link
                  to={`/u/${profile.username}`}
                  className="mt-3 block truncate rounded-lg bg-white/[0.05] px-3 py-2 font-mono text-[11.5px] text-2"
                >
                  /u/{profile.username}
                </Link>
              </Card>
            )}
          </aside>
        </div>
      </div>
    </>
  )
}
