import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { ProductArt, ProductCard, Stars } from "../components/ui";

export default function Product() {
  const { id } = useParams();
  const { user, notify, refreshCart } = useApp();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [mine, setMine] = useState(0);
  const [hover, setHover] = useState(0);

  useEffect(() => {
    setD(null);
    window.scrollTo(0, 0);
    api.product(id).then((x) => { setD(x); setMine(x.my_rating?.rating || 0); }).catch((e) => setErr(e.message));
  }, [id, user]);

  const guard = () => { if (!user) { nav("/login"); return false; } return true; };
  const add = async () => {
    if (!guard()) return;
    await api.addToCart(d.item.item_id);
    refreshCart();
    notify("Added to your bag — recommendations updated");
  };
  const rate = async (v) => {
    if (!guard()) return;
    await api.rate(d.item.item_id, v);
    setMine(v);
    notify(`Rated ${v}★ — your profile has been updated`);
  };
  const unrate = async () => {
    await api.unrate(d.item.item_id);
    setMine(0);
    notify("Rating removed");
  };

  if (err) return <div className="empty" style={{ marginTop: 40 }}>{err}</div>;
  if (!d) return <div className="empty" style={{ marginTop: 40 }}>Loading…</div>;
  const it = d.item;

  return (
    <>
      <section className="detail fade">
        <div className="img"><ProductArt item={it} /></div>
        <div style={{ display: "grid", gap: 20, alignContent: "start" }}>
          <div className="kicker">{it.department} · {it.class_name}</div>
          <h1 style={{ fontSize: 40 }}>{it.name}</h1>
          <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
            <span style={{ fontFamily: "var(--serif)", fontSize: 28 }}>${it.price.toFixed(2)}</span>
            <span><Stars value={it.avg_rating} /> <span className="faint">{it.avg_rating} from {it.n_reviews} reviews</span></span>
          </div>
          <div className="kv">
            <div><strong>{Math.round(it.recommend_rate * 100)}%</strong><span className="faint">would recommend</span></div>
            <div><strong>{it.bayes_score}</strong><span className="faint">Bayesian score</span></div>
            <div><strong>{it.avg_age}</strong><span className="faint">avg. reviewer age</span></div>
          </div>
          {it.blurb && <blockquote>“{it.blurb}{it.blurb.length >= 220 ? "…" : ""}”{it.headline && <div className="faint" style={{ fontFamily: "var(--sans)", marginTop: 6 }}>— review titled “{it.headline}”</div>}</blockquote>}
          <div>{it.keywords.map((k) => <span key={k} className="tag">{k}</span>)}</div>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <button className="btn accent" onClick={add}>Add to bag</button>
          </div>
          <div className="panel">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
              <div>
                <h3>Your rating</h3>
                <div className="faint">Ratings feed straight into your recommendation profile.</div>
              </div>
              {mine > 0 && <button className="btn ghost sm" onClick={unrate}>Remove</button>}
            </div>
            <div className="rate-input" onMouseLeave={() => setHover(0)} style={{ marginTop: 10 }}>
              {[1, 2, 3, 4, 5].map((v) => (
                <button key={v} className={(hover || mine) >= v ? "on" : ""} onMouseEnter={() => setHover(v)} onClick={() => rate(v)} aria-label={`${v} stars`}>★</button>
              ))}
            </div>
          </div>
        </div>
      </section>
      <section className="section">
        <div className="section-head">
          <div><h2>You may also like</h2><div className="faint">Item-to-item hybrid similarity (30 % collaborative, 70 % content)</div></div>
        </div>
        <div className="rail">{d.similar.map((s) => <ProductCard key={s.item_id} item={s} />)}</div>
      </section>
    </>
  );
}
