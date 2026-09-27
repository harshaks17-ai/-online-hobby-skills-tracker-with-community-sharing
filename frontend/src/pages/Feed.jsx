import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../context/ToastContext'
import { communityApi, skillsApi } from '../lib/api'
import { useAsync, useDebounced } from '../lib/hooks'
import { compactNumber, humanMinutes, timeAgo } from '../lib/format'
import { CATEGORY_MAP, FEED_FILTERS, accent } from '../lib/constants'
import { Page, Stagger, StaggerItem } from '../components/Background'
import {
  Avatar, AvatarStack, Badge, Button, Card, Collapse, EmptyState, Input, PillGroup,
  Segmented, Textarea,
} from '../components/ui'

const SCOPES = [
  { id: 'global', label: 'Everyone' },
  { id: 'following', label: 'Following' },
  { id: 'mine', label: 'Mine' },
]

const SORTS = [
  { id: 'recent', label: 'Recent' },
  { id: 'top', label: 'Most liked' },
]

export default function Feed() {
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const [scope, setScope] = useState('global')
  const [category, setCategory] = useState('all')
  const [sort, setSort] = useState('recent')
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounced(search, 400)
  const [composerOpen, setComposerOpen] = useState(searchParams.get('compose') === '1')

  const { data, loading, refetch } = useAsync(
    () =>
      communityApi.feed({
        scope,
        category: category === 'all' ? undefined : category,
        sort,
        search: debouncedSearch || undefined,
        page,
        page_size: 8,
      }),
    [scope, category, sort, debouncedSearch, page],
  )
  const { data: skillsData } = useAsync(() => skillsApi.list(), [])
  const { data: trendingSkills } = useAsync(() => communityApi.trendingSkills(), [])

  const posts = data?.items || []

  useEffect(() => {
    setPage(1)
  }, [scope, category, sort, debouncedSearch])

  const refresh = () => {
    refetch()
  }

  return (
    <Page className="grid gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-[26px] font-bold tracking-tight">Community</h1>
            <p className="mt-1 text-[13.5px] text-3">
              {loading ? 'Loading the feed…' : `${data?.total ?? 0} updates from the community`}
            </p>
          </div>
          <Button variant="primary" onClick={() => setComposerOpen(true)}>
            <span className="text-base leading-none">+</span> Share Update
          </Button>
        </div>

        <Composer
          open={composerOpen}
          skills={skillsData?.items || []}
          currentUser={user}
          onClose={() => setComposerOpen(false)}
          onPosted={refresh}
        />

        <div className="flex flex-wrap items-center gap-3">
          <Segmented options={SCOPES} value={scope} onChange={setScope} />
          <Segmented options={SORTS} value={sort} onChange={setSort} />
          <div className="relative ml-auto">
            <Input
              placeholder="Search the feed…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 sm:w-56"
              aria-label="Search the community feed"
            />
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[13px] text-3">⌕</span>
          </div>
        </div>

        <PillGroup items={FEED_FILTERS} value={category} onChange={setCategory} />

        {loading ? (
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="skeleton h-56 rounded-2xl" />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <Card>
            <EmptyState
              icon="💬"
              title={debouncedSearch ? `Nothing matches “${debouncedSearch}”` : 'The feed is quiet'}
              message={
                scope === 'following'
                  ? 'Follow a few people and their updates will show up here.'
                  : scope === 'mine'
                    ? 'You have not shared an update yet. Post your first win.'
                    : 'Be the first to share something.'
              }
              action={
                <Button variant="primary" onClick={() => setComposerOpen(true)}>
                  Share an update
                </Button>
              }
            />
          </Card>
        ) : (
          <Stagger className="space-y-4">
            {posts.map((post) => (
              <StaggerItem key={post.id}>
                <PostCard post={post} currentUser={user} onChange={refresh} />
              </StaggerItem>
            ))}
          </Stagger>
        )}

        {data && data.total > 0 && (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button variant="ghost" disabled={!data.has_prev} onClick={() => setPage((p) => Math.max(1, p - 1))}>
              ← Newer
            </Button>
            <span className="text-[12.5px] tabular text-3">
              Page {data.page} of {Math.max(1, Math.ceil(data.total / data.page_size))}
            </span>
            <Button variant="ghost" disabled={!data.has_next} onClick={() => setPage((p) => p + 1)}>
              Older →
            </Button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------- right rail */}
      <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
        <Card className="p-5">
          <h3 className="text-[14.5px] font-semibold tracking-tight">Trending skills</h3>
          <p className="mt-0.5 text-[12px] text-3">Most practised across the community</p>
          <div className="mt-4 space-y-2.5">
            {(trendingSkills?.items || []).slice(0, 7).map((skill, index) => (
              <Link
                key={skill.id}
                to={`/app/discover?search=${encodeURIComponent(skill.title)}`}
                className="flex items-center gap-3 rounded-xl p-2 transition hover:bg-white/[0.04]"
              >
                <span className="w-4 text-[11px] font-bold text-3 tabular">{index + 1}</span>
                <span
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[15px]"
                  style={{ background: `${accent(skill.accent).hex}22` }}
                >
                  {skill.icon}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-semibold">{skill.title}</div>
                  <div className="text-[11px] text-3">
                    {humanMinutes(skill.minutes)} · {compactNumber(skill.sessions)} sessions
                  </div>
                </div>
              </Link>
            ))}
            {(trendingSkills?.items || []).length === 0 && (
              <p className="py-4 text-center text-[12.5px] text-3">Nothing trending yet.</p>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="text-[14.5px] font-semibold tracking-tight">Feed tips</h3>
          <ul className="mt-3 space-y-2.5 text-[12.5px] leading-relaxed text-3">
            {[
              'Attach a skill so others can find your post by category.',
              'Logging practice with “Share” posts it here for you.',
              'Follow people to build a distraction-free feed.',
              'You can delete your own post at any time.',
            ].map((tip) => (
              <li key={tip} className="flex gap-2.5">
                <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-400" />
                {tip}
              </li>
            ))}
          </ul>
        </Card>
      </aside>
    </Page>
  )
}

/* ---------------------------------------------------------------- composer */
function Composer({ open, skills, currentUser, onClose, onPosted }) {
  const toast = useToast()
  const [text, setText] = useState('')
  const [skillId, setSkillId] = useState('')
  const [visibility, setVisibility] = useState('public')
  const [saving, setSaving] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    if (open) setTimeout(() => textareaRef.current?.focus(), 120)
    else {
      setText('')
      setSkillId('')
      setVisibility('public')
    }
  }, [open])

  const submit = async (event) => {
    event.preventDefault()
    if (!text.trim()) return
    setSaving(true)
    try {
      await communityApi.post({
        content: text.trim(),
        skill_id: skillId || null,
        visibility,
      })
      toast.celebrate('Shared with the community 🎉')
      onPosted?.()
      onClose()
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="p-5">
      <form onSubmit={submit}>
        <div className="flex gap-3.5">
          <Avatar user={currentUser} size={42} />
          <div className="min-w-0 flex-1">
            <Textarea
              ref={textareaRef}
              id="postText"
              rows={3}
              placeholder="What did you get better at today?"
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={3000}
              className="border-0 bg-transparent px-0 py-1 text-[14.5px] focus:shadow-none"
              aria-label="Post text"
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-white/5 pt-3.5">
          <select
            value={skillId}
            onChange={(e) => setSkillId(e.target.value)}
            className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[12.5px] text-2 ring-1 ring-white/5 outline-none focus:ring-brand-400"
            aria-label="Attach a skill"
          >
            <option value="">No skill</option>
            {skills.map((skill) => (
              <option key={skill.id} value={skill.id}>
                {skill.icon} {skill.title}
              </option>
            ))}
          </select>

          <select
            value={visibility}
            onChange={(e) => setVisibility(e.target.value)}
            className="rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[12.5px] text-2 ring-1 ring-white/5 outline-none focus:ring-brand-400"
            aria-label="Post visibility"
          >
            <option value="public">🌍 Public</option>
            <option value="followers">🔒 Followers only</option>
          </select>

          <span className="text-[11.5px] tabular text-3">{text.length}/3000</span>
          <Button
            type="submit"
            id="submitPost"
            size="sm"
            className="ml-auto"
            disabled={!text.trim()}
            loading={saving}
          >
            Share Update
          </Button>
        </div>
      </form>
    </Card>
  )
}

/* ----------------------------------------------------------------- post */
function PostCard({ post, currentUser, onChange }) {
  const { user } = useAuth()
  const toast = useToast()
  const [liked, setLiked] = useState(post.liked_by_me)
  const [likes, setLikes] = useState(post.likes_count)
  const [comments, setComments] = useState(post.comments || [])
  const [commentCount, setCommentCount] = useState(post.comments_count)
  const [commentText, setCommentText] = useState('')
  const [showComments, setShowComments] = useState(false)
  const [sending, setSending] = useState(false)
  const [busy, setBusy] = useState(false)
  const [likers, setLikers] = useState([])

  const isOwner = user?.id === post.user_id

  useEffect(() => {
    if (showComments) {
      communityApi.comments(post.id, { page_size: 50 }).then((data) => setComments(data.items || []))
    }
  }, [showComments, post.id])

  const like = async () => {
    if (busy) return
    setBusy(true)
    // Optimistic: the heart responds instantly, the server confirms after.
    const next = !liked
    setLiked(next)
    setLikes((n) => n + (next ? 1 : -1))
    try {
      const result = next
        ? await communityApi.like(post.id)
        : await communityApi.unlike(post.id)
      setLikes(result.likes_count)
      if (next) {
        communityApi.likers(post.id).then((d) => setLikers(d.items || [])).catch(() => {})
      }
    } catch (err) {
      setLiked(!next)
      setLikes((n) => n + (next ? -1 : 1))
      toast.error(err.message)
    } finally {
      setBusy(false)
    }
  }

  const addComment = async (event) => {
    event.preventDefault()
    if (!commentText.trim()) return
    setSending(true)
    try {
      const created = await communityApi.comment(post.id, { content: commentText.trim() })
      setComments((c) => [...c, created])
      setCommentCount((n) => n + 1)
      setCommentText('')
      setShowComments(true)
    } catch (err) {
      toast.error(err.message)
    } finally {
      setSending(false)
    }
  }

  const removePost = async () => {
    try {
      await communityApi.removePost(post.id)
      toast.success('Post deleted.')
      onChange?.()
    } catch (err) {
      toast.error(err.message)
    }
  }

  const removeComment = async (commentId) => {
    try {
      await communityApi.removeComment(commentId)
      setComments((c) => c.filter((c) => c.id !== commentId))
      setCommentCount((n) => Math.max(0, n - 1))
    } catch (err) {
      toast.error(err.message)
    }
  }

  const report = async () => {
    try {
      await communityApi.report({ target_type: 'post', target_id: post.id, reason: 'other' })
      toast.success('Thanks — our moderators will take a look.')
    } catch (err) {
      toast.error(err.message)
    }
  }

  const category = CATEGORY_MAP[post.category]

  return (
    <Card className="group overflow-hidden p-5 transition hover:border-white/10">
      <div className="flex gap-3.5">
        <Link to={`/u/${post.author?.username}`}>
          <Avatar user={post.author} size={42} />
        </Link>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <Link
              to={`/u/${post.author?.username}`}
              className="text-[14px] font-semibold hover:text-brand-300"
            >
              {post.author?.name}
            </Link>
            <span className="text-[12.5px] text-3">@{post.author?.username}</span>
            {post.author?.is_moderator && (
              <Badge tone="sky" size="sm">
                Moderator
              </Badge>
            )}
            <span className="text-[12px] text-3">· {timeAgo(post.created_at)}</span>
            {post.visibility === 'followers' && (
              <span className="text-[11.5px] text-3" title="Followers only">
                🔒
              </span>
            )}
          </div>

          {post.skill_title && (
            <div className="mt-1.5">
              <span
                className="chip"
                style={{ background: `${accent(post.skill_accent).hex}1f`, color: accent(post.skill_accent).text.replace('text-', 'text-') }}
              >
                {post.skill_icon} {post.skill_title}
              </span>
            </div>
          )}

          <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-1">{post.content}</p>

          {post.media_url && (
            <img
              src={post.media_url}
              alt="Attached achievement"
              loading="lazy"
              className="mt-3.5 max-h-[380px] w-full rounded-xl object-cover ring-1 ring-white/10"
            />
          )}

          {/* actions */}
          <div className="mt-4 flex items-center gap-1.5 border-t border-white/5 pt-3">
            <button
              type="button"
              onClick={like}
              disabled={busy || !currentUser}
              aria-pressed={liked}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold transition ${
                liked ? 'text-rose-300' : 'text-3 hover:bg-white/[0.06] hover:text-1'
              }`}
            >
              <motion.span
                key={liked ? 'on' : 'off'}
                initial={{ scale: liked ? 0.6 : 1 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 18 }}
                className="text-[15px]"
              >
                {liked ? '❤️' : '🤍'}
              </motion.span>
              {likes}
            </button>

            <button
              type="button"
              onClick={() => setShowComments((s) => !s)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[12.5px] font-semibold text-3 transition hover:bg-white/[0.06] hover:text-1"
            >
              💬 {commentCount}
            </button>

            {category && (
              <Link
                to={`/app/feed`}
                className="ml-1 hidden text-[11.5px] text-3 hover:text-2 sm:inline"
              >
                #{category.id}
              </Link>
            )}

            <div className="ml-auto flex items-center gap-1 opacity-0 transition group-hover:opacity-100">
              {!isOwner && (
                <Button variant="quiet" size="icon-sm" onClick={report} aria-label="Report post">
                  🚩
                </Button>
              )}
              {isOwner && (
                <Button variant="quiet" size="icon-sm" onClick={removePost} aria-label="Delete post">
                  🗑
                </Button>
              )}
            </div>
          </div>

          {likers.length > 0 && (
            <div className="mt-2 flex items-center gap-2 text-[11.5px] text-3">
              <AvatarStack users={likers} max={4} size={20} />
              <span className="truncate">
                {likers[0].name}
                {likers.length > 1 ? ` and ${likers.length - 1} other${likers.length > 2 ? 's' : ''}` : ''} liked this
              </span>
            </div>
          )}

          {/* comment box */}
          {currentUser && (
            <form onSubmit={addComment} className="mt-3 flex items-center gap-2.5">
              <Avatar user={currentUser} size={30} />
              <Input
                placeholder="Add a comment…"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="py-2 text-[13px]"
                maxLength={1200}
              />
              <Button
                type="submit"
                size="icon-sm"
                variant="primary"
                disabled={!commentText.trim()}
                loading={sending}
                aria-label="Post comment"
              >
                ↑
              </Button>
            </form>
          )}

          <Collapse open={showComments}>
            <div className="mt-3 space-y-2.5 border-l-2 border-white/5 pl-3.5">
              {comments.map((comment) => (
                <div key={comment.id} className="group/comment flex gap-2.5">
                  <Avatar user={comment.author} size={28} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/u/${comment.author?.username}`}
                        className="text-[12.5px] font-semibold hover:text-brand-300"
                      >
                        {comment.author?.name}
                      </Link>
                      <span className="text-[11px] text-3">{timeAgo(comment.created_at)}</span>
                      {(user?.id === comment.user_id || isOwner) && (
                        <button
                          type="button"
                          onClick={() => removeComment(comment.id)}
                          className="ml-auto text-[11px] text-3 opacity-0 transition hover:text-rose-300 group-hover/comment:opacity-100"
                          aria-label="Delete comment"
                        >
                          delete
                        </button>
                      )}
                    </div>
                    <p className="mt-0.5 text-[12.5px] leading-relaxed text-2">{comment.content}</p>
                  </div>
                </div>
              ))}
              {comments.length === 0 && (
                <p className="py-2 text-[12.5px] text-3">No comments yet. Say something nice.</p>
              )}
            </div>
          </Collapse>
        </div>
      </div>
    </Card>
  )
}
