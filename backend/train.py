"""
Train the hybrid recommender, run the offline evaluation and export every artefact the
API, the React dashboard and the in-browser live demo need.

    python train.py                 # full pipeline (~30 s)
    python train.py --skip-figures  # no matplotlib figures
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import pandas as pd

from recommender.engine import HybridRecommender, build_catalog, load_reviews
from recommender.evaluate import evaluate

ROOT = Path(__file__).parent
DATA = ROOT / "data" / "womens_clothing_reviews.csv"
ART = ROOT / "artifacts"
FIG = ROOT.parent / "docs" / "figures"
DEMO = ROOT.parent / "frontend" / "src" / "demo" / "bundle.json"


def eda(raw: pd.DataFrame, df: pd.DataFrame) -> dict:
    n_seg, n_item = df["segment"].nunique(), df["item_id"].nunique()
    filled = df.groupby(["segment", "item_id"]).ngroups
    return {
        "n_reviews_raw": int(len(raw)), "n_reviews": int(len(df)),
        "n_items_raw": int(raw["Clothing ID"].nunique()), "n_items": int(n_item),
        "n_segments": int(n_seg), "avg_rating": round(float(df["rating"].mean()), 3),
        "recommend_rate": round(float(df["recommended"].mean()), 3),
        "sparsity_segment_matrix": round(1 - filled / (n_seg * n_item), 4),
        "sparsity_row_index_matrix": round(1 - 1 / raw["Clothing ID"].nunique(), 6),
        "missing": {k: int(v) for k, v in raw.isna().sum().items() if v},
        "rating_distribution": {int(k): int(v) for k, v in df["rating"].value_counts().sort_index().items()},
        "class_counts": {k: int(v) for k, v in df["class_name"].value_counts().items()},
        "department_counts": {k: int(v) for k, v in df["department"].value_counts().items()},
        "age_bands": {f"{int(b.left)+1}-{int(b.right)}": int(v) for b, v in
                      pd.cut(df["age"], [17, 24, 34, 44, 54, 64, 99]).value_counts().sort_index().items()},
        "rating_by_department": {k: round(float(v), 3) for k, v in df.groupby("department")["rating"].mean().items()},
        "reviews_per_item_quantiles": {q: float(df["item_id"].value_counts().quantile(q)) for q in (0.25, 0.5, 0.75, 0.9)},
    }


def neighbours(S: np.ndarray, ids: np.ndarray, k: int = 40) -> dict:
    out = {}
    for r, iid in enumerate(ids):
        top = np.argsort(-S[r])[:k]
        out[int(iid)] = [[int(ids[j]), round(float(S[r, j]), 3)] for j in top if S[r, j] > 0]
    return out


def main(skip_figures: bool = False) -> None:
    raw = pd.read_csv(DATA, index_col=0)
    df = load_reviews(DATA)
    catalog = build_catalog(df)
    ART.mkdir(exist_ok=True)

    print("• training hybrid model")
    model = HybridRecommender(n_components=40, alpha=0.3).fit(df, catalog["item_id"].to_numpy())
    model.save(ART)
    catalog["keywords"] = catalog["item_id"].map(lambda i: model.keywords.get(int(i), []))
    catalog.to_json(ART / "catalog.json", orient="records")

    print("• evaluating baselines vs hybrid")
    report = evaluate(df, alpha=0.3, n_components=40)
    report["results"]["hybrid_mmr"] = evaluate(df, alpha=0.3, n_components=40, diversity=0.3,
                                               modes=("hybrid",))["results"]["hybrid"]
    print("• tuning curves")
    report["alpha_curve"] = []
    for a in (0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0):
        r = evaluate(df, alpha=a, n_components=40, modes=("hybrid",))["results"]["hybrid"]
        report["alpha_curve"].append({"alpha": a, "precision@10": r["precision@10"], "ndcg@10": r["ndcg@10"],
                                      "coverage": r["coverage"], "diversity": r["diversity"]})
    report["components_curve"] = []
    for nc in (5, 10, 20, 40, 60, 80):
        r = evaluate(df, alpha=0.3, n_components=nc, modes=("hybrid",))["results"]["hybrid"]
        report["components_curve"].append({"n_components": nc, "precision@10": r["precision@10"], "ndcg@10": r["ndcg@10"]})
    report["config"] = {"alpha": 0.3, "n_components": 40, "pop_weight": 0.05, "min_reviews_per_item": 3,
                        "segment": "age x division", "test_fraction": 0.2, "relevance": "rating >= 4"}
    stats = eda(raw, df)
    (ART / "metrics.json").write_text(json.dumps(report, indent=2))
    (ART / "eda.json").write_text(json.dumps(stats, indent=2))

    print("• exporting live-demo bundle")
    lit = pd.read_csv(ROOT / "data" / "literature_review.csv").dropna(how="all").fillna("")
    DEMO.parent.mkdir(parents=True, exist_ok=True)
    DEMO.write_text(json.dumps({
        "catalog": json.loads(catalog.to_json(orient="records")),
        "nn_cf": neighbours(model.sim_cf, model.item_ids),
        "nn_cb": neighbours(model.sim_cb, model.item_ids),
        "pop": {int(i): round(float(p), 4) for i, p in zip(model.item_ids, model.pop)},
        "metrics": report, "eda": stats, "literature": lit.to_dict(orient="records"),
    }, separators=(",", ":")))

    if not skip_figures:
        figures(report, stats)
    for m, r in report["results"].items():
        print(f"  {m:11s} P@10={r['precision@10']:.3f}  NDCG@10={r['ndcg@10']:.3f}  "
              f"Cov={r['coverage']:.3f}  Div={r['diversity']:.3f}")


def figures(report: dict, stats: dict) -> None:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    FIG.mkdir(parents=True, exist_ok=True)
    plt.rcParams.update({"font.size": 10, "axes.spines.top": False, "axes.spines.right": False})
    ink, accent, mute = "#1f2937", "#b4532a", "#9ca3af"

    fig, ax = plt.subplots(figsize=(6, 3.2))
    rd = stats["rating_distribution"]
    ax.bar([str(k) for k in rd], list(rd.values()), color=accent)
    ax.set(title="Rating distribution", xlabel="Stars", ylabel="Reviews")
    fig.tight_layout(); fig.savefig(FIG / "fig1_rating_distribution.png", dpi=180); plt.close(fig)

    fig, ax = plt.subplots(figsize=(6, 4))
    cc = dict(list(stats["class_counts"].items())[:12])
    ax.barh(list(cc)[::-1], list(cc.values())[::-1], color=accent)
    ax.set(title="Reviews per product class", xlabel="Reviews")
    fig.tight_layout(); fig.savefig(FIG / "fig2_class_counts.png", dpi=180); plt.close(fig)

    labels = {"popular": "Popularity", "content": "Content (TF-IDF)", "cf": "CF (SVD)",
              "hybrid": "Hybrid", "hybrid_mmr": "Hybrid + MMR"}
    res = report["results"]
    metrics = ["precision@10", "recall@10", "ndcg@10", "coverage"]
    fig, ax = plt.subplots(figsize=(7.5, 3.6))
    w = 0.16
    for i, m in enumerate(labels):
        ax.bar(np.arange(len(metrics)) + (i - 2) * w, [res[m][x] for x in metrics], w,
               label=labels[m], color=[mute, "#d6a77a", "#7c8ea6", accent, ink][i])
    ax.set_xticks(range(len(metrics)), [m.replace("@", " @") for m in metrics])
    ax.set(title="Model comparison (held-out consumer segments)")
    ax.legend(frameon=False, fontsize=8, ncol=3)
    fig.tight_layout(); fig.savefig(FIG / "fig3_model_comparison.png", dpi=180); plt.close(fig)

    ac = report["alpha_curve"]
    fig, ax = plt.subplots(figsize=(6, 3.2))
    ax.plot([a["alpha"] for a in ac], [a["ndcg@10"] for a in ac], "-o", color=accent, label="NDCG@10")
    ax.plot([a["alpha"] for a in ac], [a["precision@10"] for a in ac], "-o", color=ink, label="Precision@10")
    ax.plot([a["alpha"] for a in ac], [a["coverage"] for a in ac], "--", color=mute, label="Coverage")
    ax.set(title="Effect of α (0 = pure content, 1 = pure CF)", xlabel="α")
    ax.legend(frameon=False, fontsize=8)
    fig.tight_layout(); fig.savefig(FIG / "fig4_alpha_tuning.png", dpi=180); plt.close(fig)
    print(f"• figures written to {FIG}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--skip-figures", action="store_true")
    main(ap.parse_args().skip_figures)
