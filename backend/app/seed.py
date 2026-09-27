"""
Deterministic demo dataset.

Everything here is synthetic. The same seed always produces the same database,
so screenshots in the report, test expectations and the running app never drift.

Accounts created (all with the password from `DEMO_PASSWORD`):

    user@test.com     the primary walkthrough account (also used by the E2E suite)
    aisha@test.com    photography + film
    dev@test.com      coding + side projects
    marco@test.com    guitar + music production
    yuki@test.com     language learning
    leo@test.com      fitness + running
    sam@test.com      cooking
    moderator@test.com  the Moderator role, for the moderation-queue demo
"""

from __future__ import annotations

import math
import random
from datetime import date, datetime, time, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import (
    Comment,
    Follow,
    Goal,
    Like,
    Milestone,
    Notification,
    Post,
    PracticeSession,
    Skill,
    User,
    UserStats,
)
from app.services import stats_service
from app.services.goal_service import auto_milestones, minutes_to_unit
from app.utils.security import hash_password

SEED = 20260927

DEMO_ACCOUNTS: list[dict] = [
    {
        "email": "user@test.com",
        "username": "demo",
        "name": "Aarav Sharma",
        "bio": "Full-stack student documenting the journey from zero to shipping. "
               "Guitar on weekdays, code on weekends.",
        "location": "Bengaluru, India",
        "website": "https://github.com/",
        "interests": ["coding", "music", "photography"],
        "moderator": True,
    },
    {
        "email": "aisha@test.com",
        "username": "aisha",
        "name": "Aisha Rahman",
        "bio": "Documentary photographer chasing natural light. Currently on a "
               "365-day film roll challenge.",
        "location": "Mumbai, India",
        "website": "",
        "interests": ["photography", "art", "travel"],
    },
    {
        "email": "dev@test.com",
        "username": "devansh",
        "name": "Devansh Rao",
        "bio": "Backend engineer learning distributed systems by building them. "
               "LeetCode, system design, and a lot of coffee.",
        "location": "Pune, India",
        "website": "https://github.com/",
        "interests": ["coding", "reading", "chess"],
    },
    {
        "email": "marco@test.com",
        "username": "marco",
        "name": "Marco Dsouza",
        "bio": "Classical guitarist, bedroom producer. 100 days of scales, no skips.",
        "location": "Goa, India",
        "website": "",
        "interests": ["music", "design"],
    },
    {
        "email": "yuki@test.com",
        "username": "yuki",
        "name": "Yuki Tanaka",
        "bio": "Learning Japanese one review card at a time. N4 by December.",
        "location": "Kochi, Japan",
        "website": "",
        "interests": ["language", "reading"],
    },
    {
        "email": "leo@test.com",
        "username": "leo",
        "name": "Leo Fernandes",
        "bio": "Marathon build-up. Consistency over intensity, every single time.",
        "location": "Lisbon, Portugal",
        "website": "",
        "interests": ["fitness", "running"],
    },
    {
        "email": "sam@test.com",
        "username": "sam",
        "name": "Sam Okafor",
        "bio": "Home cook turned bread nerd. Fermentation enthusiast.",
        "location": "Lagos, Nigeria",
        "website": "",
        "interests": ["cooking", "writing"],
    },
    {
        "email": "moderator@test.com",
        "username": "mod_nadia",
        "name": "Nadia Petrov",
        "bio": "Community moderator. I keep the feed kind and the reports queue short.",
        "location": "Berlin, Germany",
        "website": "",
        "interests": ["writing", "photography"],
        "moderator": True,
    },
]

SKILL_TEMPLATES: dict[str, list[dict]] = {
    "demo": [
        {
            "title": "Guitar", "category": "music", "icon": "🎸", "accent": "amber",
            "description": "Fingerstyle and chord progressions. Working toward a clean "
                           "set of three songs I can play end to end.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 210, "minutes_per_session": 35,
        },
        {
            "title": "React & Frontend", "category": "coding", "icon": "⚛️", "accent": "sky",
            "description": "Deep dive into rendering, state management and performance. "
                           "Rebuilding three production apps from scratch.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 240, "minutes_per_session": 45,
        },
        {
            "title": "Street Photography", "category": "photography", "icon": "📷",
            "accent": "violet",
            "description": "Golden-hour walks with a 35mm prime. Learning to read light "
                           "before raising the camera.",
            "current_level": "BEGINNER", "target_level": "INTERMEDIATE",
            "goal_per_week": 120, "minutes_per_session": 30,
        },
    ],
    "aisha": [
        {
            "title": "Film Photography", "category": "photography", "icon": "🎞️",
            "accent": "amber",
            "description": "One roll of Port 400 a month, developed and scanned myself. "
                           "Learning to meter for shadows instead of highlights.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 180, "minutes_per_session": 40,
        },
        {
            "title": "Photo Editing", "category": "design", "icon": "🎛️", "accent": "pink",
            "description": "Colour grading fundamentals and a consistent personal LUT.",
            "current_level": "BEGINNER", "target_level": "INTERMEDIATE",
            "goal_per_week": 90, "minutes_per_session": 30,
        },
    ],
    "devansh": [
        {
            "title": "System Design", "category": "coding", "icon": "🧱", "accent": "emerald",
            "description": "Designing, estimating and reviewing distributed architectures. "
                           "Working through 50 real interview problems.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 300, "minutes_per_session": 50,
        },
        {
            "title": "Competitive Programming", "category": "coding", "icon": "🏆",
            "accent": "sky",
            "description": "Div2 contests, then upsolving every problem I missed.",
            "current_level": "ADVANCED", "target_level": "ADVANCED",
            "goal_per_week": 240, "minutes_per_session": 40,
        },
    ],
    "marco": [
        {
            "title": "Classical Guitar", "category": "music", "icon": "🎼", "accent": "amber",
            "description": "Sor scales, arpeggios, and two études. Recording myself weekly "
                           "to hear what I actually sound like.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 300, "minutes_per_session": 45,
        },
        {
            "title": "Music Production", "category": "music", "icon": "🎛️", "accent": "pink",
            "description": "Mixing my own tracks. Learning to trust the low end.",
            "current_level": "BEGINNER", "target_level": "INTERMEDIATE",
            "goal_per_week": 150, "minutes_per_session": 35,
        },
    ],
    "yuki": [
        {
            "title": "Japanese", "category": "language", "icon": "🇯🇵", "accent": "rose",
            "description": "Grammar drills plus daily listening. Targeting JLPT N4.",
            "current_level": "BEGINNER", "target_level": "INTERMEDIATE",
            "goal_per_week": 280, "minutes_per_session": 25,
        },
        {
            "title": "Reading", "category": "reading", "icon": "📚", "accent": "emerald",
            "description": "Twenty pages a day, fiction and non-fiction in rotation.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 140, "minutes_per_session": 30,
        },
    ],
    "leo": [
        {
            "title": "Running", "category": "fitness", "icon": "🏃", "accent": "emerald",
            "description": "Building to a half marathon. Easy runs, one tempo run a week.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 270, "minutes_per_session": 45,
        },
        {
            "title": "Strength Training", "category": "fitness", "icon": "🏋️", "accent": "rose",
            "description": "Three-day full body split, progressive overload, no ego lifts.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 180, "minutes_per_session": 50,
        },
    ],
    "sam": [
        {
            "title": "Sourdough", "category": "cooking", "icon": "🍞", "accent": "amber",
            "description": "A starter named Gerald, kept alive since February. Loaf number "
                           "thirty-one is the best one yet.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 120, "minutes_per_session": 40,
        },
        {
            "title": "Food Writing", "category": "writing", "icon": "✍️", "accent": "violet",
            "description": "Short essays about what I cooked and what went wrong.",
            "current_level": "BEGINNER", "target_level": "INTERMEDIATE",
            "goal_per_week": 90, "minutes_per_session": 30,
        },
    ],
    "mod_nadia": [
        {
            "title": "Journaling", "category": "writing", "icon": "📓", "accent": "violet",
            "description": "Morning pages, unmodified. Twenty minutes, no editing.",
            "current_level": "INTERMEDIATE", "target_level": "ADVANCED",
            "goal_per_week": 140, "minutes_per_session": 20,
        },
    ],
}

ACTIVITIES: dict[str, list[tuple[str, str]]] = {
    "music": [
        ("Scale practice", "Long tones, 120bpm metronome. Thumb finally caught up."),
        ("Song practice", "Worked the bridge until the chord change was automatic."),
        ("Repertoire run", "Full piece start to finish, no stopping. Two mistakes only."),
        ("Theory", "Chord inversions and why the V-I sounds like resolution."),
    ],
    "coding": [
        ("Refactor sprint", "Split the component, killed 80 lines of duplication."),
        ("Problem solving", "Two medium graphs, one I could not see until morning."),
        ("Reading", "Finished a chapter on consistency models and took notes."),
        ("Project build", "Wired the auth flow end to end. Debugged a token race."),
        ("Code review", "Reviewed two PRs and wrote better comments than code."),
    ],
    "photography": [
        ("Golden hour walk", "Forty-five minutes, one roll, no deletions."),
        ("Natural light study", "Same corner at three different hours. The 5pm one won."),
        ("Portraits", "Shot three friends, natural light only, one reflector."),
        ("Editing", "Graded the weekend roll. Learned to lift shadows gently."),
    ],
    "fitness": [
        ("Easy run", "Kept the pace conversational. Consistency over intensity."),
        ("Tempo run", "Four kilometres at threshold. Legs heavy afterwards."),
        ("Strength session", "Squat, press, row. Added 2.5kg to two of the three."),
        ("Mobility", "Twenty minutes on hips and thoracic spine."),
    ],
    "cooking": [
        ("Loaf bake", "Oven spring was perfect for once. Crumb still a little dense."),
        ("Starter feeding", "Fed Gerald. Dough got noticeably easier to handle."),
        ("Recipe development", "Lowered the hydration twice. Third attempt worked."),
        ("Meal prep", "Six lunches, two sauces, one very tired kitchen."),
    ],
    "language": [
        ("Grammar drills", "Particles. Finally stopped mixing up は and が."),
        ("Listening", "One podcast at 0.9x with a transcript in hand."),
        ("Vocabulary", "Thirty new cards, twelve actually retained."),
        ("Shadowing", "Read along, then repeated without the script."),
    ],
    "writing": [
        ("Morning pages", "Three pages, no editing, one surprisingly honest paragraph."),
        ("Essay draft", "Rewrote the opening four times. The third was the one."),
        ("Editing", "Cut a third of the draft. It needed it."),
    ],
    "reading": [
        ("Deep work reading", "Forty pages of systems design, took notes."),
        ("Fiction", "Twenty pages before bed. The kind of reading that resets me."),
    ],
    "design": [
        ("Colour study", "Built a six-stop palette and tested it on real photos."),
        ("Typography drill", "Matched weights and spacing on a poster grid."),
    ],
    "other": [
        ("General practice", "Logged the session and kept the habit intact."),
    ],
}

POST_TEMPLATES: list[str] = [
    "Week {n} of showing up and it finally clicked. {detail}",
    "Small win today: {detail} Not dramatic, but it counts.",
    "Hit a milestone I set eight weeks ago. {detail}",
    "Honest update — I nearly skipped this one, then didn't. {detail}",
    "{detail} Turns out the boring version was the right version all along.",
    "New personal best. {detail} Everything else is just practice from here.",
    "Some weeks the goal is progress, some weeks it is just not quitting. {detail}",
    "Finally understand the thing I could not understand last month. {detail}",
]

COMMENT_TEMPLATES: list[str] = [
    "This is the consistency I am trying to build. Keep going!",
    "Genuinely inspired — logging sessions makes such a difference.",
    "What did your warm-up look like for this one?",
    "Saving this for the next time I want to quit.",
    "The notes on this are so useful, thanks for sharing.",
    "Adding this to my own goal list immediately.",
    "Been there. The version of you six months from now is grateful.",
    "Okay this made my day. Congratulations!",
    "How are you tracking the streak, an app or manual?",
    "I tried this approach last month and it clicked for me too.",
]

MILESTONE_NOTES = [
    "Uploaded a photo of the finished piece to prove it.",
    "Screen recording of the final run.",
    "Photo of the notebook page, dated.",
]


def _rng(salt: int = 0) -> random.Random:
    return random.Random(SEED + salt)


def _at(days_ago: int, hour: int, minute: int = 0) -> datetime:
    """Build a UTC timestamp `days_ago` days back at a given wall-clock time."""
    day = date.today() - timedelta(days=days_ago)
    return datetime.combine(day, time(hour=hour, minute=minute), tzinfo=timezone.utc)


def _password_hash() -> str:
    """One hash reused for every demo account - seeding must stay fast."""
    return hash_password(settings.demo_password)


def _gradient_avatar(username: str) -> str:
    """
    Deterministic avatar so seeded users have a real image without shipping
    binary assets. A tiny inline SVG data-URI, encoded per user.
    """
    import base64
    import hashlib

    digest = hashlib.sha256(username.encode()).digest()
    hue = digest[0] * 360 // 256
    hue2 = (hue + 55) % 360
    initials = username[:2].upper()
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="hsl({hue},72%,58%)"/>'
        f'<stop offset="100%" stop-color="hsl({hue2},70%,44%)"/>'
        f'</linearGradient></defs>'
        f'<rect width="160" height="160" fill="url(#g)"/>'
        f'<text x="80" y="80" font-family="Inter,Arial,sans-serif" font-size="64" '
        f'font-weight="700" fill="rgba(255,255,255,0.94)" text-anchor="middle" '
        f'dominant-baseline="central">{initials}</text></svg>'
    )
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def _banner(username: str) -> str:
    import base64
    import hashlib

    digest = hashlib.sha256((username + "banner").encode()).digest()
    h1 = digest[0] * 360 // 256
    h2 = (h1 + 70) % 360
    h3 = (h2 + 40) % 360
    svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="300">'
        f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
        f'<stop offset="0%" stop-color="hsl({h1},65%,22%)"/>'
        f'<stop offset="50%" stop-color="hsl({h2},70%,32%)"/>'
        f'<stop offset="100%" stop-color="hsl({h3},60%,18%)"/>'
        f'</linearGradient></defs>'
        f'<rect width="1200" height="300" fill="url(#g)"/>'
        f'<circle cx="980" cy="60" r="150" fill="rgba(255,255,255,0.06)"/>'
        f'<circle cx="180" cy="270" r="110" fill="rgba(255,255,255,0.05)"/></svg>'
    )
    return "data:image/svg+xml;base64," + base64.b64encode(svg.encode()).decode()


def seed_if_empty(db: Session | None = None) -> bool:
    """Populate the demo dataset once. Safe to call on every boot."""
    from app.database import session_scope

    if db is not None:
        return _seed(db)
    with session_scope() as session:
        return _seed(session)


def _seed(db: Session) -> bool:
    existing = db.scalar(select(func.count(User.id)))
    if existing:
        return False

    logger = __import__("logging").getLogger("hobbylog.seed")
    logger.info("Seeding demo dataset (first boot)...")

    password = _password_hash()
    users: dict[str, User] = {}
    created: list[User] = []

    for index, spec in enumerate(DEMO_ACCOUNTS):
        user = User(
            email=spec["email"],
            username=spec["username"],
            name=spec["name"],
            bio=spec["bio"],
            location=spec.get("location", ""),
            website=spec.get("website", ""),
            interests=spec.get("interests", []),
            password_hash=password,
            avatar_url=_gradient_avatar(spec["username"]),
            banner_url=_banner(spec["username"]),
            is_moderator=spec.get("moderator", False),
            is_active=True,
            profile_visibility="public",
            onboarding_complete=True,
            last_login_at=_at(0, 8, 30),
            created_at=_at(200 - index * 7, 10, 0),
        )
        db.add(user)
        created.append(user)
        users[spec["username"]] = user
    db.flush()

    # ---------------------------------------------------------------- skills
    skills: list[Skill] = []
    for username, templates in SKILL_TEMPLATES.items():
        user = users[username]
        for template in templates:
            skill = Skill(
                user_id=user.id,
                title=template["title"],
                category=template["category"],
                description=template["description"],
                icon=template["icon"],
                accent=template["accent"],
                current_level=template["current_level"],
                target_level=template["target_level"],
                status="ACTIVE",
                goal_per_week=template["goal_per_week"],
                minutes_per_session=template["minutes_per_session"],
                start_date=date.today() - timedelta(days=_rng(index).randint(60, 160)),
                target_date=date.today() + timedelta(days=_rng(index + 7).randint(30, 180)),
            )
            db.add(skill)
            skills.append(skill)
    db.flush()

    # ------------------------------------------------------------- sessions
    # A 120-day history with a believable rhythm: a long unbroken run for the
    # demo account (so the streak card is impressive), patchier for the rest.
    session_rows: list[PracticeSession] = []
    for skill_index, skill in enumerate(skills):
        rng = _rng(skill_index * 31)
        owner = skill.user_id
        is_demo = owner == users["demo"].id
        horizon = 120 if is_demo else rng.randint(45, 95)
        density = 0.82 if is_demo else rng.uniform(0.45, 0.75)
        base = skill.minutes_per_session

        for days_ago in range(horizon, -1, -1):
            if rng.random() > density:
                continue
            # A small chance of a double session, as real life has them.
            count = 2 if rng.random() < 0.08 else 1
            for extra in range(count):
                minutes = max(
                    5,
                    int(base * rng.uniform(0.6, 1.5)) + (extra * 10),
                )
                hour = rng.choice([6, 7, 8, 9, 17, 18, 19, 20, 21, 22])
                activity, note = rng.choice(
                    ACTIVITIES.get(skill.category, ACTIVITIES["other"])
                )
                row = PracticeSession(
                    user_id=owner,
                    skill_id=skill.id,
                    duration_minutes=minutes,
                    activity=activity,
                    notes=note,
                    practiced_at=_at(days_ago, hour, rng.randint(0, 55)),
                    mood=rng.choice(["rough", "okay", "good", "good", "great", "flow"]),
                    created_at=_at(days_ago, hour, rng.randint(0, 55)),
                )
                db.add(row)
                session_rows.append(row)
    db.flush()

    # --------------------------------------------------------------- goals
    goal_specs = [
        # (username, skill title, title, target, unit, kind, status override)
        ("demo", "Guitar", "Play three songs end to end", 30, "hours", "TOTAL", None),
        ("demo", "Guitar", "Hit a 20-hour practice month", 1200, "minutes", "TOTAL", None),
        ("demo", "React & Frontend", "Ship 3 portfolio projects", 3, "pieces", "TOTAL", None),
        ("demo", "React & Frontend", "Weekly coding consistency", 1000, "minutes", "WEEKLY", None),
        ("demo", "Street Photography", "Complete a 12-roll year", 12, "pieces", "TOTAL", None),
        ("aisha", "Film Photography", "Develop 24 rolls by hand", 24, "pieces", "TOTAL", None),
        ("aisha", "Photo Editing", "Build a consistent personal LUT", 8, "hours", "TOTAL", None),
        ("devansh", "System Design", "Finish 50 design problems", 50, "pieces", "TOTAL", None),
        ("devansh", "Competitive Programming", "Reach 1600 on the practice ladder", 1600, "reps", "TOTAL", None),
        ("marco", "Classical Guitar", "Record three clean étude videos", 3, "pieces", "TOTAL", None),
        ("marco", "Music Production", "Finish mixing four tracks", 40, "hours", "TOTAL", None),
        ("yuki", "Japanese", "Pass JLPT N4", 120, "hours", "TOTAL", None),
        ("yuki", "Reading", "Finish 24 books this year", 24, "pieces", "TOTAL", None),
        ("leo", "Running", "Half marathon under 2 hours", 500, "km", "TOTAL", None),
        ("leo", "Strength Training", "Bench 100kg for five reps", 500, "reps", "TOTAL", None),
        ("sam", "Sourdough", "Bake 100 sourdough loaves", 100, "pieces", "TOTAL", None),
        ("sam", "Food Writing", "Publish 30 short essays", 30, "pieces", "TOTAL", None),
    ]

    skill_index = {(s.user_id, s.title): s for s in skills}
    goals: list[Goal] = []
    for index, (username, skill_title, title, target, unit, kind, _) in enumerate(goal_specs):
        user = users[username]
        skill = skill_index.get((user.id, skill_title))
        if skill is None:
            continue
        goal = Goal(
            user_id=user.id,
            skill_id=skill.id,
            title=title,
            description=f"Tracked against {skill_title} practice sessions.",
            target_value=float(target),
            current_value=0.0,
            unit=unit,
            kind=kind,
            deadline=date.today() + timedelta(days=_rng(index + 3).randint(20, 150)),
            status="ACTIVE",
            created_at=_at(_rng(index + 11).randint(50, 120), 12, 0),
        )
        db.add(goal)
        db.flush()
        for definition in auto_milestones(float(target), unit):
            db.add(
                Milestone(
                    goal_id=goal.id,
                    user_id=user.id,
                    title=definition["title"],
                    target_value=definition["target_value"],
                )
            )
        goals.append(goal)
    db.flush()

    # Derive every goal's progress from the session log, exactly the way the
    # running application does. This guarantees the seeded numbers are correct.
    from app.services import goal_service

    for goal in goals:
        owner = next(u for u in created if u.id == goal.user_id)
        goal_service.rebuild_goal_progress(db, owner, goal)
    db.flush()

    # ---------------------------------------------------------------- posts
    posts: list[Post] = []
    for index, user in enumerate(created):
        rng = _rng(index * 17)
        own_skills = [s for s in skills if s.user_id == user.id]
        if not own_skills:
            continue
        for number in range(rng.randint(2, 4)):
            skill = rng.choice(own_skills)
            pool = ACTIVITIES.get(skill.category, ACTIVITIES["other"])
            detail = rng.choice(pool)[1]
            days_ago = rng.randint(0, 40)
            post = Post(
                user_id=user.id,
                skill_id=skill.id,
                content=rng.choice(POST_TEMPLATES).format(n=number + 1, detail=detail),
                media_url=None,
                visibility="public",
                category=skill.category,
                created_at=_at(days_ago, rng.randint(9, 21), rng.randint(0, 59)),
            )
            db.add(post)
            posts.append(post)
    db.flush()
    posts.sort(key=lambda p: p.created_at)

    # ------------------------------------------------------ likes, comments
    for index, post in enumerate(posts):
        rng = _rng(index * 13 + 5)
        likers = [u for u in created if u.id != post.user_id]
        rng.shuffle(likers)
        chosen = likers[: rng.randint(1, min(6, len(likers)))]
        for liker in chosen:
            db.add(Like(post_id=post.id, user_id=liker.id, created_at=post.created_at))
            post.likes_count += 1
            if rng.random() < 0.45:
                db.add(
                    Notification(
                        user_id=post.user_id,
                        actor_id=liker.id,
                        type="like",
                        message=f"{liker.name} liked your update",
                        link=f"/post/{post.id}",
                        read=rng.random() < 0.6,
                        created_at=post.created_at,
                    )
                )
        commenters = [u for u in created if u.id != post.user_id]
        rng.shuffle(commenters)
        for commenter in commenters[: rng.randint(0, 3)]:
            comment = Comment(
                post_id=post.id,
                user_id=commenter.id,
                content=rng.choice(COMMENT_TEMPLATES),
                created_at=post.created_at + timedelta(minutes=rng.randint(5, 400)),
            )
            db.add(comment)
            post.comments_count += 1
    db.flush()

    # -------------------------------------------------------------- follows
    usernames = list(users)
    for index, follower in enumerate(created):
        rng = _rng(index * 23 + 2)
        candidates = [u for u in created if u.id != follower.id]
        rng.shuffle(candidates)
        for target in candidates[: rng.randint(2, 5)]:
            db.add(
                Follow(
                    follower_id=follower.id,
                    following_id=target.id,
                    created_at=_at(rng.randint(1, 90), 12, 0),
                )
            )
    db.flush()

    # Proof images for a few milestones -> exercises the object-storage path.
    from app.models import FileAsset
    from cloud import storage_service

    achieved = [m for g in goals for m in g.milestones if m.achieved]
    for index, milestone in enumerate(achieved[:6]):
        user = next(u for u in created if u.id == milestone.user_id)
        key = storage_service.build_object_key(user.id, "proof", f"milestone-{index}.svg")
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="800" height="500">'
            f'<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">'
            f'<stop offset="0%" stop-color="hsl({index * 47 % 360},70%,26%)"/>'
            f'<stop offset="100%" stop-color="hsl({index * 47 % 360 + 80},70%,42%)"/>'
            f'</linearGradient></defs><rect width="800" height="500" fill="url(#g)"/>'
            f'<text x="40" y="250" font-family="Inter,Arial" font-size="40" fill="#fff" '
            f'font-weight="700">Proof of practice</text>'
            f'<text x="40" y="300" font-family="Inter,Arial" font-size="22" fill="rgba(255,255,255,0.8)">'
            f'{milestone.title}</text></svg>'
        ).encode()
        stored = storage_service.put_object(key, svg, "image/svg+xml")
        url = storage_service.get_public_url(key)
        db.add(
            FileAsset(
                user_id=user.id,
                owner_scope="proof",
                original_name=f"milestone-{index}.svg",
                storage_path=key,
                content_type="image/svg+xml",
                size_bytes=len(svg),
                url=url,
                visibility="public",
                checksum=stored["checksum"],
            )
        )
        milestone.proof_url = url
    db.flush()

    # ---------------------------------------------------------------- stats
    for user in created:
        stats_service.recompute_stats(db, user.id)
    db.commit()

    logger.info(
        "Seed complete: %d users, %d skills, %d sessions, %d goals, %d posts.",
        len(created), len(skills), len(session_rows), len(goals), len(posts),
    )
    return True


def reset_database() -> None:
    """Drop and recreate every table (used by tests and the reset script)."""
    from app.database import Base, engine, session_scope

    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    with session_scope() as session:
        _seed(session)


if __name__ == "__main__":  # pragma: no cover
    reset_database()
    print("Database reset and seeded.")
