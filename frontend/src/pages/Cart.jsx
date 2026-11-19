import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import { Empty, ProductArt, ProductCard } from "../components/ui";

export default function Cart() {
  const { notify, refreshCart } = useApp();
  const [cart, setCart] = useState(null);
  const [recs, setRecs] = useState([]);
  const [orders, setOrders] = useState([]);

  const sync = (c) => { setCart(c); refreshCart(); };
  useEffect(() => { api.cart().then(setCart); api.orders().then((o) => setOrders(o.items)); }, []);
  useEffect(() => {
    if (!cart) return;
    const ids = cart.items.map((i) => i.item_id);
    if (ids.length) api.cartRecommend(ids).then((r) => setRecs(r.items)); else setRecs([]);
  }, [cart]);

  const checkout = async () => {
    const { order } = await api.checkout();
    notify(`Order #${order.id} placed — $${order.total.toFixed(2)}`);
    setOrders((o) => [order, ...o]);
    sync(await api.cart());
  };

  if (!cart) return <Empty>Loading…</Empty>;
  return (
    <div className="cols-2" style={{ paddingTop: 40, alignItems: "start", gridTemplateColumns: "1.4fr 1fr" }}>
      <section>
        <h1 style={{ fontSize: 40 }}>Your bag</h1>
        {cart.items.length === 0 ? (
          <div style={{ marginTop: 20 }}><Empty>Your bag is empty. <Link to="/" style={{ color: "var(--accent)" }}>Start shopping</Link>.</Empty></div>
        ) : (
          <>
            {cart.items.map((l) => (
              <div className="cart-line" key={l.item_id}>
                <Link to={`/product/${l.item_id}`} className="img"><ProductArt item={l} /></Link>
                <div><div style={{ fontFamily: "var(--serif)", fontSize: 17 }}>{l.name}</div><div className="faint">{l.class_name} · ${l.price.toFixed(2)}</div></div>
                <div className="qty">
                  <button onClick={async () => sync(await api.setQty(l.item_id, l.quantity - 1))}>−</button>
                  <span style={{ minWidth: 20, textAlign: "center" }}>{l.quantity}</span>
                  <button onClick={async () => sync(await api.setQty(l.item_id, l.quantity + 1))}>+</button>
                </div>
                <strong>${(l.price * l.quantity).toFixed(2)}</strong>
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20 }}>
              <span style={{ fontFamily: "var(--serif)", fontSize: 24 }}>Total ${cart.total.toFixed(2)}</span>
              <button className="btn accent" onClick={checkout}>Place order (simulated)</button>
            </div>
          </>
        )}
        {recs.length > 0 && (
          <div className="section">
            <div className="section-head"><div><h2>Complete the look</h2><div className="faint">Cart-based hybrid recommendations with diversity re-ranking</div></div></div>
            <div className="rail">{recs.map((r) => <ProductCard key={r.item_id} item={r} showReason />)}</div>
          </div>
        )}
      </section>
      <aside className="panel">
        <h3>Order history</h3>
        <div className="faint" style={{ marginBottom: 10 }}>Purchases carry the strongest weight (+2.5) in your profile and are never re-recommended.</div>
        {orders.length === 0 ? <div className="muted">No orders yet.</div> : orders.map((o) => (
          <div key={o.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between" }}><strong>Order #{o.id}</strong><span>${o.total.toFixed(2)}</span></div>
            <div className="faint">{new Date(o.created_at).toLocaleString()} · {o.lines.reduce((s, l) => s + l.quantity, 0)} items</div>
          </div>
        ))}
      </aside>
    </div>
  );
}
