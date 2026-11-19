import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Empty, ProductCard, Stars } from "../components/ui";

const MODES = [["hybrid", "Hybrid"], ["cf", "Collaborative"], ["content", "Content"], ["popular", "Popularity"]];

export default function ForYou() {
  const { notify } = useApp();
  const [mode, setMode] = useState("hybrid");
  const [alpha, setAlpha] = useState(0.3);
  const [diversity, setDiversity] = useState(0.2);
  const [recs, setRecs] = useState(null);
  const [ratings, setRatings] = useState([]);

  const loadRatings = () => api.ratings().then((r) => setRatings(r.items));
  useEffect(() => { loadRatings(); }, []);
  useEffect(() => {
    const t = setTimeout(() => api.recommendations({ k: 12, mode, alpha, diversity }).then(setRecs), 120);
    return () => clearTimeout(t);
  }, [mode, alpha, diversity, ratings]);

  const remove = async (id) => { await api.unrate(id); notify("Rating removed"); loadRatings(); };

  return (
    <>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="kicker">Personal recommendations</div>
        <h1 style={{ fontSize: 40 }}>For you</h1>
        <p className="muted" style={{ maxWidth: 640 }}>
          Your profile combines explicit ratings (rating − 3), items in your bag (+1.5), purchases (+2.5) and recent views (+0.17).
          Use the lab below to see how each algorithm from the thesis changes what you get.
        </p>
      </section>

      <section className="panel lab">
        <div className="field">Algorithm
          <div className="seg">{MODES.map(([v, l]) => <button key={v} className={mode === v ? "on" : ""} onClick={() => setMode(v)}>{l}</button>)}</div>
        </div>
        <label className="field">α — collaborative weight: <b>{alpha.toFixed(2)}</b>
          <input type="range" min="0" max="1" step="0.05" value={alpha} disabled={mode !== "hybrid"} onChange={(e) => setAlpha(+e.target.value)} />
        </label>
        <label className="field">Diversity (MMR λ): <b>{diversity.toFixed(2)}</b>
          <input type="range" min="0" max="0.8" step="0.05" value={diversity} onChange={(e) => setDiversity(+e.target.value)} />
        </label>
        <div className="faint">
          {recs && (recs.cold_start ? "Cold start: showing popularity until you rate or add items." : `${recs.profile_size} items in your behavioural profile.`)}
        </div>
      </section>

      <section className="section">
        {recs?.items.length ? (
          <div className="grid">{recs.items.map((i) => <ProductCard key={i.item_id} item={i} showReason />)}</div>
        ) : <Empty>Loading recommendations…</Empty>}
      </section>

      <section className="section">
        <div className="section-head"><h2>Your ratings</h2><span className="faint">{ratings.length} rated</span></div>
        {ratings.length === 0 ? (
          <Empty>You haven't rated anything yet. <Link to="/" style={{ color: "var(--accent)" }}>Browse the shop</Link> and rate a few pieces.</Empty>
        ) : (
          <div className="panel" style={{ padding: 0 }}>
            <table>
              <thead><tr><th>Product</th><th>Category</th><th>Your rating</th><th /></tr></thead>
              <tbody>
                {ratings.map((r) => (
                  <tr key={r.item_id}>
                    <td><Link to={`/product/${r.item_id}`}>{r.product.name}</Link></td>
                    <td className="muted">{r.product.class_name}</td>
                    <td><Stars value={r.rating} /></td>
                    <td className="num"><button className="btn ghost sm" onClick={() => remove(r.item_id)}>Delete</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
