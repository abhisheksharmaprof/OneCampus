"""Seeded preset templates per category. Populated by the preset tasks.

Contract: each category's list must contain EXACTLY ONE preset with is_default=True —
the per-category default unique constraint is what makes concurrent seeding safe.
"""

PRESETS: dict[str, list[dict]] = {}
