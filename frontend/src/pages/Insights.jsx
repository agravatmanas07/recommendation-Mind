import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { Empty } from "../components/ui";

const C = { accent: "#b4532a", ink: "#1d1a17", mute: "#b9b0a3", green: "#3d6b4f", blue: "#5d7590" };
const LABEL = { popular: "Popularity", content: "Content (TF-IDF)", cf: "CF (SVD)", hybrid: "Hybrid", hybrid_mmr: "Hybrid + MMR" };
const axis = { fontSize: 12, fill: "#8f877d" };
const pct = (v) => `${(v * 100).toFixed(1)}%`;

export default function Insights() {
  const [a, setA] = useState(null);
  useEffect(() => { api.analytics().then(setA); }, []);
  if (!a) return <Empty>Loading analytics…</Empty>;
  const { dataset: d, evaluation: ev, live } = a;
  const rows = Object.keys(LABEL).filter((k) => ev.results[k]).map((k) => [k, ev.results[k]]);
  const best = (m) => Math.max(...rows.map(([, r]) => r[m]));
  const ratingData = Object.entries(d.rating_distribution).map(([k, v]) => ({ stars: `${k}★`, reviews: v }));
  const classData = Object.entries(d.class_counts).sort((x, y) => y[1] - x[1]).slice(0, 10).map(([k, v]) => ({ name: k, reviews: v }));
  const compare = ["precision@10", "recall@10", "ndcg@10", "hit@10", "coverage"].map((m) => ({
    metric: m, ...Object.fromEntries(rows.map(([k, r]) => [LABEL[k], +r[m].toFixed(4)])),
  }));
  const metrics = ["precision@5", "recall@5", "ndcg@5", "precision@10", "recall@10", "ndcg@10", "hit@10", "coverage", "diversity", "novelty"];

  return (
    <>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="kicker">Chapter 5 · Results</div>
        <h1 style={{ fontSize: 40 }}>Model insights</h1>
        <p className="muted" style={{ maxWidth: 760 }}>
          Offline evaluation on {ev.n_test_segments} held-out consumer segments (age × division). 20 % of each segment's items are hidden,
          every model is retrained without them, and we measure how many of the hidden items rated ≥ 4 are recovered.
        </p>
      </section>

      <section className="cols-4">
        <div className="panel kpi"><strong>{d.n_reviews.toLocaleString()}</strong><span className="faint">reviews after cleaning (of {d.n_reviews_raw.toLocaleString()})</span></div>
        <div className="panel kpi"><strong>{d.n_items}</strong><span className="faint">products with ≥ 3 reviews (of {d.n_items_raw})</span></div>
        <div className="panel kpi"><strong>{d.n_segments}</strong><span className="faint">consumer segments</span></div>
        <div className="panel kpi"><strong>{pct(d.sparsity_segment_matrix)}</strong><span className="faint">matrix sparsity (vs {pct(d.sparsity_row_index_matrix)} with row-index users)</span></div>
      </section>

      <section className="section">
        <div className="panel">
          <div className="section-head"><div><h2>Model comparison</h2><div className="faint">Higher is better · best value per column highlighted</div></div></div>
          <div style={{ overflowX: "auto" }}>
            <table>
              <thead><tr><th>Model</th>{metrics.map((m) => <th key={m} className="num">{m}</th>)}</tr></thead>
              <tbody>
                {rows.map(([k, r]) => (
                  <tr key={k} className={k === "hybrid" ? "best" : ""}>
                    <td><strong>{LABEL[k]}</strong></td>
                    {metrics.map((m) => <td key={m} className="num" style={{ fontWeight: r[m] === best(m) ? 700 : 400 }}>{m === "novelty" ? r[m].toFixed(2) : r[m].toFixed(3)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ height: 300, marginTop: 20 }}>
            <ResponsiveContainer>
              <BarChart data={compare} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#eee6db" vertical={false} />
                <XAxis dataKey="metric" tick={axis} /><YAxis tick={axis} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                {[["Popularity", C.mute], ["Content (TF-IDF)", "#d6a77a"], ["CF (SVD)", C.blue], ["Hybrid", C.accent], ["Hybrid + MMR", C.ink]].map(([k, c]) => <Bar key={k} dataKey={k} fill={c} radius={[3, 3, 0, 0]} />)}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="cols-2">
        <div className="panel">
          <h3>Tuning α (0 = pure content, 1 = pure CF)</h3>
          <div className="faint">Chosen α = {ev.config.alpha}: best NDCG with near-CF coverage</div>
          <div style={{ height: 260, marginTop: 10 }}>
            <ResponsiveContainer>
              <LineChart data={ev.alpha_curve} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#eee6db" vertical={false} />
                <XAxis dataKey="alpha" tick={axis} /><YAxis tick={axis} domain={[0, "auto"]} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="ndcg@10" stroke={C.accent} strokeWidth={2} dot={{ r: 3 }} />
                <Line dataKey="precision@10" stroke={C.ink} strokeWidth={2} dot={{ r: 3 }} />
                <Line dataKey="coverage" stroke={C.mute} strokeDasharray="4 4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <h3>SVD latent factors</h3>
          <div className="faint">Hybrid NDCG@10 vs number of components (α = {ev.config.alpha}) · explained variance at 40: {pct(ev.explained_variance)}</div>
          <div style={{ height: 260, marginTop: 10 }}>
            <ResponsiveContainer>
              <LineChart data={ev.components_curve} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#eee6db" vertical={false} />
                <XAxis dataKey="n_components" tick={axis} /><YAxis tick={axis} domain={["auto", "auto"]} />
                <Tooltip /><Legend wrapperStyle={{ fontSize: 12 }} />
                <Line dataKey="ndcg@10" stroke={C.accent} strokeWidth={2} dot={{ r: 3 }} />
                <Line dataKey="precision@10" stroke={C.ink} strokeWidth={2} dot={{ r: 3 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="cols-2 section">
        <div className="panel">
          <h3>Rating distribution</h3>
          <div className="faint">Average {d.avg_rating}★ · {pct(d.recommend_rate)} of reviewers recommend the item</div>
          <div style={{ height: 240, marginTop: 10 }}>
            <ResponsiveContainer>
              <BarChart data={ratingData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid stroke="#eee6db" vertical={false} />
                <XAxis dataKey="stars" tick={axis} /><YAxis tick={axis} /><Tooltip />
                <Bar dataKey="reviews" fill={C.accent} radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="panel">
          <h3>Reviews by product class</h3>
          <div className="faint">Top 10 classes — a long-tail, imbalanced catalogue</div>
          <div style={{ height: 240, marginTop: 10 }}>
            <ResponsiveContainer>
              <BarChart data={classData} layout="vertical" margin={{ top: 0, right: 10, left: 20, bottom: 0 }}>
                <XAxis type="number" tick={axis} /><YAxis type="category" dataKey="name" tick={axis} width={80} interval={0} /><Tooltip />
                <Bar dataKey="reviews" fill={C.ink} radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      <section className="panel">
        <h3>Live system activity</h3>
        <div className="faint" style={{ marginBottom: 12 }}>{a.live && "Signals captured by this deployment"}</div>
        <div className="cols-4">
          <div className="kpi"><strong>{live.users}</strong><span className="faint">users</span></div>
          <div className="kpi"><strong>{live.ratings}</strong><span className="faint">ratings</span></div>
          <div className="kpi"><strong>{live.orders}</strong><span className="faint">orders</span></div>
          <div className="kpi"><strong>{Object.values(live.events).reduce((s, v) => s + v, 0)}</strong><span className="faint">behaviour events ({Object.entries(live.events).map(([k, v]) => `${k} ${v}`).join(", ") || "none yet"})</span></div>
        </div>
      </section>
    </>
  );
}
