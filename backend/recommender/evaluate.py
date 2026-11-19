"""
Offline evaluation (thesis Chapter 5).

Protocol: for every consumer segment with >= MIN_POS positively-rated items (rating >= 4),
hold out 20 % of its items (all of the segment's reviews on them). The model is re-trained
on the remaining data only (no leakage), the segment's training items form its profile,
and the held-out positives are the ground truth.

Metrics @K: Precision, Recall, NDCG, Hit-rate, plus catalogue Coverage, intra-list
Diversity (1 - mean pairwise content similarity) and Novelty (mean self-information).
"""
from __future__ import annotations

import numpy as np
import pandas as pd

from .engine import HybridRecommender

MIN_POS = 10


def split(df: pd.DataFrame, test_frac: float = 0.2, seed: int = 42):
    rng = np.random.default_rng(seed)
    test_keys = set()
    truth: dict[str, set[int]] = {}
    for seg, g in df.groupby("segment"):
        pos = g.loc[g["rating"] >= 4, "item_id"].unique()
        if len(pos) < MIN_POS:
            continue
        items = g["item_id"].unique()
        held = rng.choice(items, size=max(1, int(len(items) * test_frac)), replace=False)
        truth[seg] = set(int(i) for i in held if i in set(pos))
        test_keys.update((seg, int(i)) for i in held)
    key = list(zip(df["segment"], df["item_id"].astype(int)))
    is_test = np.array([k in test_keys for k in key])
    truth = {s: t for s, t in truth.items() if t}
    return df[~is_test], truth


def profile_of(train: pd.DataFrame, seg: str) -> dict[int, float]:
    g = train[train["segment"] == seg].groupby("item_id")["rating"].mean()
    return {int(i): float(r - 3.0) for i, r in g.items() if r != 3}


def evaluate(df: pd.DataFrame, ks=(5, 10), alpha=0.6, n_components=40, diversity=0.0,
             modes=("popular", "content", "cf", "hybrid"), seed=42) -> dict:
    train, truth = split(df, seed=seed)
    model = HybridRecommender(n_components=n_components, alpha=alpha).fit(train, np.array(sorted(df["item_id"].unique())))
    idx = model._index()
    pop_counts = df["item_id"].value_counts()
    p_item = (pop_counts / pop_counts.sum()).to_dict()
    results = {}
    for mode in modes:
        K = max(ks)
        per = {k: {"precision": [], "recall": [], "ndcg": [], "hit": []} for k in ks}
        rec_items, divs, novs = set(), [], []
        for seg, rel in truth.items():
            prof = profile_of(train, seg)
            if not prof:
                continue
            recs = [r["item_id"] for r in model.recommend(prof, k=K, mode=mode, diversity=diversity)]
            rec_items.update(recs)
            hits = [1 if r in rel else 0 for r in recs]
            for k in ks:
                h = hits[:k]
                per[k]["precision"].append(sum(h) / k)
                per[k]["recall"].append(sum(h) / len(rel))
                dcg = sum(x / np.log2(i + 2) for i, x in enumerate(h))
                idcg = sum(1 / np.log2(i + 2) for i in range(min(k, len(rel))))
                per[k]["ndcg"].append(dcg / idcg)
                per[k]["hit"].append(1.0 if sum(h) else 0.0)
            ii = [idx[r] for r in recs[:10]]
            if len(ii) > 1:
                sub = model.sim_cb[np.ix_(ii, ii)]
                divs.append(1 - sub[np.triu_indices(len(ii), 1)].mean())
            novs.append(np.mean([-np.log2(p_item.get(r, 1e-6)) for r in recs[:10]]))
        res = {f"{m}@{k}": round(float(np.mean(v)), 4) for k in ks for m, v in per[k].items()}
        res["coverage"] = round(len(rec_items) / len(model.item_ids), 4)
        res["diversity"] = round(float(np.mean(divs)), 4)
        res["novelty"] = round(float(np.mean(novs)), 3)
        results[mode] = res
    return {"n_test_segments": len(truth), "n_items": int(len(model.item_ids)),
            "explained_variance": round(model.explained_variance, 4), "results": results}
