"""In-memory catalogue + model store, and behavioural profile construction."""
from __future__ import annotations

import csv
import json
from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select

from recommender.engine import EVENT_WEIGHTS, HybridRecommender

from .db import CartItem, Event, Order, OrderLine, Rating, Session


@dataclass
class Store:
    model: HybridRecommender
    catalog: dict[int, dict]
    metrics: dict
    eda: dict

    @classmethod
    def load(cls, art_dir: str) -> "Store":
        art = Path(art_dir)
        if not (art / "model.npz").exists():
            raise RuntimeError(f"No trained model in {art}. Run `python train.py` first.")
        catalog = {int(r["item_id"]): r for r in json.loads((art / "catalog.json").read_text())}
        return cls(model=HybridRecommender.load(art), catalog=catalog,
                   metrics=json.loads((art / "metrics.json").read_text()),
                   eda=json.loads((art / "eda.json").read_text()))

    def item(self, item_id: int) -> dict | None:
        return self.catalog.get(int(item_id))

    def hydrate(self, recs: list[dict]) -> list[dict]:
        out = []
        for r in recs:
            it = self.item(r["item_id"])
            if not it:
                continue
            reason = r["reason"]
            if r.get("because") and self.item(r["because"]):
                reason = f"Because you liked {self.item(r['because'])['name']}"
            out.append({**card(it), "score": r["score"], "reason": reason, "because": r.get("because")})
        return out


def card(it: dict) -> dict:
    keys = ("item_id", "name", "class_name", "department", "division", "price", "avg_rating",
            "n_reviews", "recommend_rate", "bayes_score", "keywords")
    return {k: it.get(k) for k in keys}


def user_profile(user_id: int) -> tuple[dict[int, float], set[int]]:
    """Combine explicit ratings and implicit behaviour into one weighted profile."""
    s = Session()
    profile: dict[int, float] = {}
    for r in s.scalars(select(Rating).where(Rating.user_id == user_id)):
        profile[r.item_id] = profile.get(r.item_id, 0) + (r.rating - 3.0)          # -2 .. +2
    for c in s.scalars(select(CartItem).where(CartItem.user_id == user_id)):
        profile[c.item_id] = profile.get(c.item_id, 0) + EVENT_WEIGHTS["cart"]
    bought = set()
    for line in s.scalars(select(OrderLine).join(Order).where(Order.user_id == user_id)):
        bought.add(line.item_id)
        profile[line.item_id] = profile.get(line.item_id, 0) + EVENT_WEIGHTS["purchase"]
    views = s.scalars(select(Event).where(Event.user_id == user_id, Event.kind == "view")
                      .order_by(Event.created_at.desc()).limit(30)).all()
    for v in views:
        profile[v.item_id] = profile.get(v.item_id, 0) + EVENT_WEIGHTS["view"] / 3
    return profile, bought


def load_literature(path: str) -> list[dict]:
    with open(path, newline="", encoding="utf-8") as f:
        rows = [r for r in csv.DictReader(f) if any((v or "").strip() for v in r.values())]
    for i, r in enumerate(rows):
        r["id"] = i + 1
    return rows
