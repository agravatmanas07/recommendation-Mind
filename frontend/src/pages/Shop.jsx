import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Empty, ProductCard } from "../components/ui";

const SORTS = [["popular", "Most reviewed"], ["rating", "Best rated"], ["price_asc", "Price ↑"], ["price_desc", "Price ↓"]];

export default function Shop() {
  const { user } = useApp();
  const [facets, setFacets] = useState({ categories: [], departments: [] });
  const [f, setF] = useState({ q: "", category: "", department: "", min_rating: "", sort: "popular", page: 1 });
  const [data, setData] = useState(null);
  const [recs, setRecs] = useState(null);
  const [stats, setStats] = useState(null);

  useEffect(() => { api.facets().then(setFacets); api.analytics().then((a) => setStats(a)); }, []);
  useEffect(() => {
    const t = setTimeout(() => api.products({ ...f, per_page: 24 }).then(setData), 150);
    return () => clearTimeout(t);
  }, [f]);
  useEffect(() => {
    if (user) api.recommendations({ k: 10 }).then(setRecs).catch(() => setRecs(null));
    else setRecs(null);
  }, [user]);

  const set = (k, v) => setF((o) => ({ ...o, [k]: v, page: k === "page" ? v : 1 }));
  const pages = data ? Math.ceil(data.total / data.per_page) : 1;
  const hybrid = stats?.evaluation.results.hybrid;

  return (
    <>
      <section className="hero">
        <div>
          <div className="kicker">Consumer-behaviour recommender</div>
          <h1>Clothes chosen by how people like you actually shop.</h1>
          <p className="muted">
            Every suggestion blends what similar shoppers rated highly (SVD collaborative filtering) with what reviews say
            about each piece (TF-IDF content model), and tells you why it was picked.
          </p>
          {!user && <p><Link className="btn accent" to="/login">Sign in for your personal picks</Link></p>}
        </div>
        {stats && (
          <div className="stat-row">
            <div><strong>{stats.dataset.n_reviews.toLocaleString()}</strong><span className="faint">real reviews</span></div>
            <div><strong>{stats.dataset.n_items}</strong><span className="faint">products</span></div>
            <div><strong>{hybrid ? `${Math.round(hybrid["ndcg@10"] * 100)}%` : "—"}</strong><span className="faint">NDCG@10 (hybrid)</span></div>
          </div>
        )}
      </section>

      {recs && recs.items.length > 0 && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2>{recs.cold_start ? "Trending with shoppers" : "Picked for you"}</h2>
              <div className="faint">{recs.cold_start ? "Rate or add a few pieces to your bag to personalise this row." : `Based on ${recs.profile_size} signals from your ratings, bag, orders and views.`}</div>
            </div>
            <Link to="/for-you" className="btn ghost sm">Open the algorithm lab →</Link>
          </div>
          <div className="rail">{recs.items.map((i) => <ProductCard key={i.item_id} item={i} showReason />)}</div>
        </section>
      )}

      <section className="section shop">
        <aside className="filters">
          <input className="input" placeholder="Search: linen, petite, flowy…" value={f.q} onChange={(e) => set("q", e.target.value)} />
          <label className="field">Sort
            <select className="input" value={f.sort} onChange={(e) => set("sort", e.target.value)}>
              {SORTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="field">Minimum rating
            <select className="input" value={f.min_rating} onChange={(e) => set("min_rating", e.target.value)}>
              <option value="">Any</option><option value="3">3+ stars</option><option value="4">4+ stars</option><option value="4.5">4.5+ stars</option>
            </select>
          </label>
          <div className="field">Department
            <div className="chips">
              <button className={`chip ${!f.department ? "on" : ""}`} onClick={() => set("department", "")}>All</button>
              {facets.departments.map((d) => <button key={d} className={`chip ${f.department === d ? "on" : ""}`} onClick={() => set("department", d)}>{d}</button>)}
            </div>
          </div>
          <div className="field">Category
            <div className="chips">
              <button className={`chip ${!f.category ? "on" : ""}`} onClick={() => set("category", "")}>All</button>
              {facets.categories.map((c) => <button key={c} className={`chip ${f.category === c ? "on" : ""}`} onClick={() => set("category", c)}>{c}</button>)}
            </div>
          </div>
        </aside>
        <div>
          <div className="section-head"><h2>Catalogue</h2><span className="faint">{data ? `${data.total} products` : "Loading…"}</span></div>
          {data && data.items.length === 0 && <Empty>No products match these filters.</Empty>}
          <div className="grid">{data?.items.map((i) => <ProductCard key={i.item_id} item={i} />)}</div>
          {pages > 1 && (
            <div className="pager">
              <button className="btn ghost sm" disabled={f.page <= 1} onClick={() => set("page", f.page - 1)}>← Prev</button>
              <span className="faint">Page {f.page} of {pages}</span>
              <button className="btn ghost sm" disabled={f.page >= pages} onClick={() => set("page", f.page + 1)}>Next →</button>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
