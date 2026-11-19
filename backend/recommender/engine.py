"""
Hybrid recommendation engine for "Product Recommendation Based on Consumer Behavior".

Components
----------
1. Collaborative filtering (CF)  – TruncatedSVD on a mean-centred consumer-segment x item
   rating matrix. The Kaggle dataset has no customer ID, so every review is mapped to a
   *consumer segment* (age x division). Segments behave like users with rich histories,
   which removes the "one rating per user" problem of using the row index as a user ID.
2. Content-based filtering (CBF)  – TF-IDF over each item's aggregated review titles,
   review text, class and department, compared with cosine similarity.
3. Popularity prior              – Bayesian-average rating, used for cold start and as a
   small additive prior.
4. Hybrid                        – sim = alpha * CF + (1 - alpha) * CBF, scored against a
   weighted user profile (ratings, cart, purchases, views) and re-ranked with Maximal
   Marginal Relevance (MMR) to control diversity. Every recommendation carries an
   explanation ("Because you liked ...").
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.decomposition import TruncatedSVD
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.preprocessing import normalize

MIN_REVIEWS_PER_ITEM = 3

# Synthetic list prices per class (the dataset has no prices - see thesis ch.5 "Weaknesses").
BASE_PRICE = {
    "Dresses": 128, "Knits": 68, "Blouses": 78, "Sweaters": 118, "Pants": 98, "Jeans": 128,
    "Fine gauge": 88, "Skirts": 88, "Jackets": 158, "Lounge": 58, "Swim": 78, "Outerwear": 198,
    "Shorts": 64, "Sleep": 54, "Legwear": 28, "Intimates": 38, "Layering": 34, "Trend": 108,
}

# Interaction weights used to build a behavioural profile (consumer-behaviour signals).
EVENT_WEIGHTS = {"view": 0.5, "cart": 1.5, "purchase": 2.5}


# --------------------------------------------------------------------------------------
# Data preparation
# --------------------------------------------------------------------------------------
def load_reviews(csv_path: str | Path) -> pd.DataFrame:
    df = pd.read_csv(csv_path, index_col=0)
    df = df.rename(columns={
        "Clothing ID": "item_id", "Age": "age", "Title": "title", "Review Text": "text",
        "Rating": "rating", "Recommended IND": "recommended",
        "Positive Feedback Count": "feedback", "Division Name": "division",
        "Department Name": "department", "Class Name": "class_name",
    })
    df = df.dropna(subset=["department", "class_name"])
    df["title"] = df["title"].fillna("")
    df["text"] = df["text"].fillna("")
    df["review_id"] = df.index.astype(int)
    df["division"] = df["division"].replace({"Initmates": "Intimates"})
    df["segment"] = df["age"].astype(int).astype(str) + "|" + df["division"]
    counts = df["item_id"].value_counts()
    keep = counts[counts >= MIN_REVIEWS_PER_ITEM].index
    return df[df["item_id"].isin(keep)].reset_index(drop=True)


def _price(item_id: int, class_name: str) -> float:
    base = BASE_PRICE.get(class_name, 80)
    h = int(hashlib.md5(str(item_id).encode()).hexdigest(), 16)
    return round(base * (0.75 + (h % 50) / 100) - 0.01, 2)


CLASS_LABEL = {
    "Dresses": "Dress", "Knits": "Knit Top", "Blouses": "Blouse", "Sweaters": "Sweater", "Pants": "Pants",
    "Jeans": "Jeans", "Fine gauge": "Fine-Gauge Knit", "Skirts": "Skirt", "Jackets": "Jacket",
    "Lounge": "Lounge Set", "Swim": "Swimsuit", "Outerwear": "Coat", "Shorts": "Shorts", "Sleep": "Sleep Set",
    "Legwear": "Tights", "Intimates": "Bralette", "Layering": "Layering Cami", "Trend": "Statement Piece",
}
ADJECTIVES = ["Everyday", "Essential", "Relaxed", "Classic", "Tailored", "Soft", "Signature",
              "Easy", "Modern", "Studio", "Weekend", "Luxe"]


def product_name(item_id: int, class_name: str) -> str:
    """The dataset has no product names; build a stable, readable label from the class."""
    return f"{ADJECTIVES[item_id % len(ADJECTIVES)]} {CLASS_LABEL.get(class_name, class_name)} No. {item_id}"


def build_catalog(df: pd.DataFrame) -> pd.DataFrame:
    g = df.groupby("item_id")
    cat = pd.DataFrame({
        "n_reviews": g.size(),
        "avg_rating": g["rating"].mean().round(2),
        "recommend_rate": g["recommended"].mean().round(3),
        "avg_age": g["age"].mean().round(1),
        "feedback": g["feedback"].sum(),
        "class_name": g["class_name"].agg(lambda s: s.mode().iat[0]),
        "department": g["department"].agg(lambda s: s.mode().iat[0]),
        "division": g["division"].agg(lambda s: s.mode().iat[0]),
    })
    # Bayesian average: shrink small-sample ratings toward the global mean.
    m, C = 10, df["rating"].mean()
    cat["bayes_score"] = ((cat["n_reviews"] * cat["avg_rating"] + m * C) / (cat["n_reviews"] + m)).round(3)
    # Most helpful non-empty review as the product blurb; most common title words as a name.
    best = (df[df["text"].str.len() > 40].sort_values(["feedback", "rating"], ascending=False)
            .drop_duplicates("item_id").set_index("item_id"))
    cat["blurb"] = best["text"].reindex(cat.index).fillna("").str.slice(0, 220)
    cat["headline"] = best["title"].reindex(cat.index).fillna("")
    cat["price"] = [_price(i, c) for i, c in zip(cat.index, cat["class_name"])]
    cat["name"] = [product_name(int(i), c) for i, c in zip(cat.index, cat["class_name"])]
    cat = cat.reset_index().rename(columns={"index": "item_id"})
    return cat.sort_values("item_id").reset_index(drop=True)


# --------------------------------------------------------------------------------------
# Model
# --------------------------------------------------------------------------------------
@dataclass
class HybridRecommender:
    n_components: int = 40
    alpha: float = 0.3             # weight of CF in the hybrid similarity
    pop_weight: float = 0.05       # additive popularity prior
    random_state: int = 42
    item_ids: np.ndarray = field(default=None, repr=False)
    sim_cf: np.ndarray = field(default=None, repr=False)
    sim_cb: np.ndarray = field(default=None, repr=False)
    pop: np.ndarray = field(default=None, repr=False)
    keywords: dict = field(default_factory=dict, repr=False)
    explained_variance: float = 0.0

    # ---------- training ----------
    def fit(self, df: pd.DataFrame, item_ids: np.ndarray | None = None) -> "HybridRecommender":
        self.item_ids = np.array(sorted(df["item_id"].unique()) if item_ids is None else item_ids)
        idx = {i: k for k, i in enumerate(self.item_ids)}
        n = len(self.item_ids)

        # --- collaborative filtering on segment x item matrix ---
        seg_item = df.groupby(["segment", "item_id"])["rating"].mean().reset_index()
        segs = {s: k for k, s in enumerate(seg_item["segment"].unique())}
        R = np.zeros((len(segs), n), dtype=np.float64)
        mask = np.zeros_like(R, dtype=bool)
        for s, i, r in seg_item.itertuples(index=False):
            if i in idx:
                R[segs[s], idx[i]] = r
                mask[segs[s], idx[i]] = True
        seg_mean = np.where(mask.any(1), (R * mask).sum(1) / np.maximum(mask.sum(1), 1), 0)
        Rc = np.where(mask, R - seg_mean[:, None] + 0.5, 0.0)   # centred; +0.5 keeps "rated" signal
        k = max(2, min(self.n_components, min(Rc.shape) - 1))
        svd = TruncatedSVD(n_components=k, random_state=self.random_state)
        svd.fit(Rc)
        self.explained_variance = float(svd.explained_variance_ratio_.sum())
        item_f = normalize((svd.components_ * svd.singular_values_[:, None]).T)
        self.sim_cf = np.clip(item_f @ item_f.T, 0, 1).astype(np.float32)

        # --- content-based on aggregated review text ---
        docs = (df.assign(doc=df["title"] + ". " + df["text"])
                  .groupby("item_id")
                  .agg(doc=("doc", " ".join), cls=("class_name", "first"), dep=("department", "first")))
        docs = docs.reindex(self.item_ids)
        corpus = (docs["cls"].fillna("") + " " + docs["dep"].fillna("") + " ") * 3 + docs["doc"].fillna("")
        tfidf = TfidfVectorizer(stop_words="english", max_features=6000, ngram_range=(1, 2),
                                sublinear_tf=True, min_df=2)
        X = tfidf.fit_transform(corpus)
        self.sim_cb = (X @ X.T).toarray().astype(np.float32)
        vocab = np.array(tfidf.get_feature_names_out())
        meta_words = set(" ".join(pd.concat([docs["cls"], docs["dep"]]).dropna()).lower().split())
        for r, iid in enumerate(self.item_ids):
            row = X.getrow(r).toarray().ravel()
            terms = [str(vocab[j]) for j in row.argsort()[::-1][:30] if row[j] > 0]
            terms = [t for t in terms if not set(t.split()) & meta_words]
            self.keywords[int(iid)] = terms[:6]

        # --- popularity prior (Bayesian average, min-max normalised) ---
        g = df.groupby("item_id")["rating"]
        cnt, mean = g.size().reindex(self.item_ids).fillna(0), g.mean().reindex(self.item_ids).fillna(0)
        C = df["rating"].mean()
        bayes = (cnt * mean + 10 * C) / (cnt + 10)
        mm = lambda s: (s - s.min()) / (s.max() - s.min() + 1e-9)
        # popularity = 50 % how often an item is reviewed (log) + 50 % how well it is rated
        self.pop = (0.5 * mm(np.log1p(cnt)) + 0.5 * mm(bayes)).to_numpy(np.float32)
        np.fill_diagonal(self.sim_cf, 0)
        np.fill_diagonal(self.sim_cb, 0)
        return self

    # ---------- inference ----------
    def _index(self) -> dict:
        if not hasattr(self, "_idx"):
            self._idx = {int(i): k for k, i in enumerate(self.item_ids)}
        return self._idx

    def similarity(self, alpha: float | None = None) -> np.ndarray:
        a = self.alpha if alpha is None else alpha
        return a * self.sim_cf + (1 - a) * self.sim_cb

    def recommend(self, profile: dict[int, float], k: int = 10, exclude: set[int] | None = None,
                  alpha: float | None = None, diversity: float = 0.0, mode: str = "hybrid",
                  candidates: set[int] | None = None) -> list[dict]:
        """profile: item_id -> weight (positive = liked, negative = disliked)."""
        idx = self._index()
        exclude = set(exclude or ()) | set(profile)
        if mode == "content":
            S = self.sim_cb
        elif mode == "cf":
            S = self.sim_cf
        else:
            S = self.similarity(alpha)

        prof = [(idx[i], w) for i, w in profile.items() if i in idx and w != 0]
        if mode == "popular" or not prof:
            scores = self.pop.copy()
            contrib = None
        else:
            cols = np.array([c for c, _ in prof])
            w = np.array([wt for _, wt in prof], dtype=np.float32)
            contrib = S[:, cols] * w[None, :]                      # n_items x n_profile
            scores = contrib.sum(1) / (np.abs(w).sum() + 1e-9) + self.pop_weight * self.pop

        allowed = np.ones(len(scores), dtype=bool)
        for i in exclude:
            if i in idx:
                allowed[idx[i]] = False
        if candidates is not None:
            cand_mask = np.zeros_like(allowed)
            for i in candidates:
                if i in idx:
                    cand_mask[idx[i]] = True
            allowed &= cand_mask
        scores = np.where(allowed, scores, -np.inf)

        order = self._mmr(scores, k, diversity) if diversity > 0 else \
            [int(j) for j in np.argsort(-scores)[:k] if np.isfinite(scores[j])]

        out = []
        for j in order:
            reason, because = "Top-rated by shoppers like you", None
            if contrib is not None:
                b = int(contrib[j].argmax())
                because = int(self.item_ids[prof[b][0]])
                reason = f"Because you liked item #{because}"
            out.append({"item_id": int(self.item_ids[j]), "score": round(float(scores[j]), 4),
                        "because": because, "reason": reason})
        return out

    def _mmr(self, scores: np.ndarray, k: int, lam: float) -> list[int]:
        cand = [int(j) for j in np.argsort(-scores)[: k * 8] if np.isfinite(scores[j])]
        if not cand:
            return []
        s = scores[cand]
        s = (s - s.min()) / (s.max() - s.min() + 1e-9)
        rel = dict(zip(cand, s))
        chosen: list[int] = []
        while cand and len(chosen) < k:
            if not chosen:
                best = max(cand, key=lambda c: rel[c])
            else:
                best = max(cand, key=lambda c: (1 - lam) * rel[c] - lam * max(self.sim_cb[c, chosen]))
            chosen.append(best)
            cand.remove(best)
        return chosen

    def similar_items(self, item_id: int, k: int = 8, alpha: float | None = None) -> list[dict]:
        return self.recommend({item_id: 1.0}, k=k, alpha=alpha)

    # ---------- persistence ----------
    def save(self, path: str | Path) -> None:
        path = Path(path)
        path.mkdir(parents=True, exist_ok=True)
        np.savez_compressed(path / "model.npz", item_ids=self.item_ids, sim_cf=self.sim_cf,
                            sim_cb=self.sim_cb, pop=self.pop)
        (path / "model_meta.json").write_text(json.dumps({
            "n_components": self.n_components, "alpha": self.alpha, "pop_weight": self.pop_weight,
            "explained_variance": self.explained_variance, "keywords": self.keywords}))

    @classmethod
    def load(cls, path: str | Path) -> "HybridRecommender":
        path = Path(path)
        meta = json.loads((path / "model_meta.json").read_text())
        z = np.load(path / "model.npz")
        m = cls(n_components=meta["n_components"], alpha=meta["alpha"], pop_weight=meta["pop_weight"])
        m.item_ids, m.sim_cf, m.sim_cb, m.pop = z["item_ids"], z["sim_cf"], z["sim_cb"], z["pop"]
        m.explained_variance = meta["explained_variance"]
        m.keywords = {int(k): v for k, v in meta["keywords"].items()}
        return m
