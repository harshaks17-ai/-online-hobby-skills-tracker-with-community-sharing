"""Goals & milestones: progress maths and the auto-milestone generator."""

from __future__ import annotations

from datetime import date, datetime, timezone
from typing import Any, Iterable, Sequence

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import Goal, Milestone, Post, Skill, User
from app.schemas import GoalCreate, GoalUpdate
from app.utils.errors import NotFoundError, ValidationError
from app.utils.helpers import progress_percent

# How many minutes make up one unit. `sessions` / `pieces` / `pages` have no
# fixed length, so they are tracked as a plain count and excluded from the
# minute<->unit conversions.
MINUTES_PER_UNIT: dict[str, float] = {"minutes": 1.0, "hours": 60.0}

UNIT_MINUTES = {"minutes": 1.0, "hours": 60.0, "sessions": 0.0}


def owned_goal(db: Session, goal_id: str, user: User) -> Goal:
    goal = db.get(Goal, goal_id)
    if goal is None:
        raise NotFoundError("Goal not found.", code="goal_not_found")
    if goal.user_id != user.id:
        raise ValidationError("You can only modify your own goals.", code="not_goal_owner")
    return goal


def minutes_to_unit(minutes: float, unit: str) -> float:
    """
    Convert a session's minutes into the goal's unit.

    60 minutes -> 1.0 hours;  90 minutes -> 90.0 minutes.
    Units without a fixed length (sessions, pieces, pages) are counted, not
    converted, so the value passes through unchanged.
    """
    per_unit = MINUTES_PER_UNIT.get(unit)
    if per_unit is None:
        return round(float(minutes), 2)
    return round(float(minutes) / per_unit, 2)


def auto_milestones(target_value: float, unit: str) -> list[dict[str, Any]]:
    """
    Generate four evenly spaced milestones (25/50/75/100%) when the user does
    not supply their own. Rounded to one decimal so the numbers stay readable.
    """
    fractions = (0.25, 0.5, 0.75, 1.0)
    unit_label = {
        "minutes": "min", "hours": "h", "sessions": "sessions",
        "pieces": "pieces", "pages": "pages", "km": "km", "reps": "reps",
    }.get(unit, unit)
    milestones: list[dict[str, Any]] = []
    for index, fraction in enumerate(fractions, start=1):
        value = round(target_value * fraction, 1)
        milestones.append(
            {
                "title": f"{value:g} {unit_label} · quarter {index}",
                "target_value": value,
            }
        )
    return milestones


def create_goal(db: Session, user: User, payload: GoalCreate) -> Goal:
    if payload.skill_id:
        skill = db.get(Skill, payload.skill_id)
        if skill is None or skill.user_id != user.id:
            raise NotFoundError("Skill not found for this account.", code="skill_not_found")

    goal = Goal(
        user_id=user.id,
        skill_id=payload.skill_id,
        title=payload.title.strip(),
        description=payload.description.strip(),
        target_value=float(payload.target_value),
        current_value=0.0,
        unit=payload.unit,
        kind=payload.kind,
        deadline=payload.deadline,
        status="ACTIVE",
    )
    db.add(goal)
    db.flush()

    definitions = payload.milestones or [
        MilestoneSchemaShim(item) for item in auto_milestones(payload.target_value, payload.unit)
    ]
    for definition in definitions:
        db.add(
            Milestone(
                goal_id=goal.id,
                user_id=user.id,
                title=definition.title,
                target_value=float(definition.target_value),
            )
        )
    db.commit()
    db.refresh(goal)
    # A goal is only ever a projection of the session log, so seed it from the
    # history that already exists rather than starting every goal at zero.
    rebuild_goal_progress(db, user, goal)
    db.commit()
    db.refresh(goal)
    return goal


class MilestoneSchemaShim:
    """Adapter so auto-generated milestones share the same shape as the schema."""

    __slots__ = ("title", "target_value")

    def __init__(self, payload: dict[str, Any]) -> None:
        self.title = payload["title"]
        self.target_value = payload["target_value"]


def update_goal(db: Session, user: User, goal_id: str, payload: GoalUpdate) -> Goal:
    goal = owned_goal(db, goal_id, user)
    data = payload.model_dump(exclude_unset=True)

    milestones = data.pop("milestones", None)
    for field, value in data.items():
        if field == "status":
            if value == "COMPLETED" and goal.status != "COMPLETED":
                goal.completed_at = datetime.now(timezone.utc)
            elif value != "COMPLETED":
                goal.completed_at = None
        setattr(goal, field, value)

    if milestones:
        db.execute(delete(Milestone).where(Milestone.goal_id == goal.id))
        db.flush()
        for definition in milestones:
            db.add(
                Milestone(
                    goal_id=goal.id,
                    user_id=user.id,
                    title=definition.title,
                    target_value=float(definition.target_value),
                )
            )
    db.commit()
    _reconcile_milestones(db, goal)
    db.commit()
    db.refresh(goal)
    return goal


def delete_goal(db: Session, user: User, goal_id: str) -> None:
    goal = owned_goal(db, goal_id, user)
    db.delete(goal)
    db.commit()


def list_goals(
    db: Session, user: User, status: str | None = None, skill_id: str | None = None
) -> list[Goal]:
    statement = select(Goal).where(Goal.user_id == user.id)
    if status:
        statement = statement.where(Goal.status == status.upper())
    if skill_id:
        statement = statement.where(Goal.skill_id == skill_id)
    return list(
        db.scalars(statement.order_by(Goal.created_at.desc())).unique().all()
    )


def _reconcile_milestones(db: Session, goal: Goal) -> list[Milestone]:
    """
    Mark every milestone whose threshold is now met, and close the goal when its
    target is reached. Idempotent - running it twice changes nothing.
    """
    changed: list[Milestone] = []
    for milestone in goal.milestones:
        if not milestone.achieved and goal.current_value >= milestone.target_value:
            milestone.achieved = True
            milestone.achieved_at = datetime.now(timezone.utc)
            changed.append(milestone)
    if goal.current_value >= goal.target_value and goal.status != "COMPLETED":
        goal.status = "COMPLETED"
        goal.completed_at = goal.completed_at or datetime.now(timezone.utc)
    elif goal.current_value < goal.target_value and goal.status == "COMPLETED":
        goal.status = "ACTIVE"
        goal.completed_at = None
    return changed


def apply_practice(
    db: Session, user: User, skill_id: str, minutes: int, practiced_on: date
) -> dict[str, Any]:
    """
    Advance every ACTIVE goal that tracks this skill and report what changed.

    * TOTAL goals accumulate the whole history.
    * WEEKLY goals accumulate only inside their own ISO week (and reset on the
      Monday boundary), which is why we subtract the previous week's value.
    Returns a summary the API surfaces as `progress_updates` so the UI can
    celebrate milestones without a second round-trip.
    """
    week_key = _iso_week(practiced_on)
    updates: list[dict[str, Any]] = []
    newly_completed: list[str] = []

    goals = list(
        db.scalars(
            select(Goal).where(
                Goal.user_id == user.id,
                Goal.skill_id == skill_id,
                Goal.status.in_(["ACTIVE", "PAUSED"]),
            )
        ).all()
    )
    for goal in goals:
        # `delta` is expressed in the goal's own unit, and so is
        # `goal.current_value` - so the accumulation is a plain addition and no
        # unit conversion is needed (or wanted: mixing scales here was an
        # early bug that inflated hour-denominated goals 60x).
        delta = 1.0 if goal.unit == "sessions" else minutes_to_unit(minutes, goal.unit)
        if delta <= 0:
            continue

        goal.current_value = round(goal.current_value + delta, 2)

        if goal.current_value > goal.target_value:
            goal.current_value = goal.target_value

        before = goal.status
        changed = _reconcile_milestones(db, goal)
        if goal.status == "COMPLETED" and before != "COMPLETED":
            newly_completed.append(goal.title)
        updates.append(
            {
                "goal_id": goal.id,
                "title": goal.title,
                "progress_percent": progress_percent(goal.current_value, goal.target_value),
                "status": goal.status,
                "milestones_achieved": [m.title for m in changed],
                "week": week_key,
            }
        )
    return {"updates": updates, "completed": newly_completed}


def _iso_week(day: date) -> str:
    year, week, _ = day.isocalendar()
    return f"{year}-W{week:02d}"


def reverse_practice(db: Session, user: User, skill_id: str, minutes: int) -> None:
    """Undo goal progress when a session is edited or deleted (keeps totals honest)."""
    goals = list(
        db.scalars(
            select(Goal).where(Goal.user_id == user.id, Goal.skill_id == skill_id)
        ).all()
    )
    for goal in goals:
        decrement = 1.0 if goal.unit == "sessions" else minutes_to_unit(minutes, goal.unit)
        goal.current_value = max(0.0, round(goal.current_value - decrement, 2))
        _reconcile_milestones(db, goal)
    db.commit()


def rebuild_goal_progress(db: Session, user: User, goal: Goal) -> Goal:
    """
    Re-derive `current_value` from `practice_sessions`.

    Guarantees correctness after bulk imports, back-fills or a retried event -
    `current_value` is always a pure function of the immutable session log.
    """
    if goal.skill_id is None:
        return goal
    from app.models import PracticeSession
    from app.utils.helpers import as_utc

    sessions = list(
        db.scalars(
            select(PracticeSession).where(
                PracticeSession.user_id == user.id, PracticeSession.skill_id == goal.skill_id
            )
        ).all()
    )
    if goal.kind == "WEEKLY":
        window = [s for s in sessions if _iso_week(as_utc(s.practiced_at).date()) == _iso_week(
            datetime.now(timezone.utc).date()
        )]
        total = len(window) if goal.unit == "sessions" else sum(
            minutes_to_unit(s.duration_minutes, goal.unit) for s in window
        )
    else:
        total = (
            len(sessions)
            if goal.unit == "sessions"
            else sum(minutes_to_unit(s.duration_minutes, goal.unit) for s in sessions)
        )
    goal.current_value = min(round(total, 2), goal.target_value)
    _reconcile_milestones(db, goal)
    return goal


def serialise_goal(db: Session, goal: Goal) -> dict[str, Any]:
    skill = db.get(Skill, goal.skill_id) if goal.skill_id else None
    milestones: Sequence[Milestone] = sorted(goal.milestones, key=lambda m: m.target_value)
    total_minutes = db.scalar(
        select(func.coalesce(func.sum(Skill.total_minutes), 0)).where(Skill.id == goal.skill_id)
    ) if goal.skill_id else 0
    return {
        "id": goal.id,
        "user_id": goal.user_id,
        "skill_id": goal.skill_id,
        "title": goal.title,
        "description": goal.description,
        "target_value": goal.target_value,
        "current_value": goal.current_value,
        "unit": goal.unit,
        "kind": goal.kind,
        "deadline": goal.deadline,
        "status": goal.status,
        "completed_at": goal.completed_at,
        "created_at": goal.created_at,
        "progress_percent": progress_percent(goal.current_value, goal.target_value),
        "skill_title": skill.title if skill else "",
        "skill_icon": skill.icon if skill else "",
        "skill_accent": skill.accent if skill else "violet",
        "skill_total_minutes": int(total_minutes or 0),
        "milestones": [
            {
                "id": m.id,
                "goal_id": m.goal_id,
                "title": m.title,
                "target_value": m.target_value,
                "achieved": m.achieved,
                "achieved_at": m.achieved_at,
                "proof_url": m.proof_url,
                "created_at": m.created_at,
            }
            for m in milestones
        ],
    }


def achievement_feed(db: Session, user: User, limit: int = 12) -> list[dict[str, Any]]:
    """Recently achieved milestones - powers the 'Achievements' rail on the dashboard."""
    from sqlalchemy import desc

    rows = db.execute(
        select(Milestone, Goal)
        .join(Goal, Goal.id == Milestone.goal_id)
        .where(Milestone.user_id == user.id, Milestone.achieved.is_(True))
        .order_by(desc(Milestone.achieved_at))
        .limit(limit)
    ).all()
    return [
        {
            "id": milestone.id,
            "title": milestone.title,
            "goal_title": goal.title,
            "achieved_at": milestone.achieved_at,
            "proof_url": milestone.proof_url,
            "icon": "🏁",
        }
        for milestone, goal in rows
    ]


def goals_summary(goals: Iterable[Goal]) -> dict[str, Any]:
    goals = list(goals)
    return {
        "total": len(goals),
        "active": sum(1 for g in goals if g.status == "ACTIVE"),
        "completed": sum(1 for g in goals if g.status == "COMPLETED"),
        "paused": sum(1 for g in goals if g.status == "PAUSED"),
        "average_progress": round(
            sum(progress_percent(g.current_value, g.target_value) for g in goals) / len(goals), 1
        ) if goals else 0.0,
    }
