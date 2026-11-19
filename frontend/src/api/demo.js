// In-browser twin of the Flask API, used by the live demo build.
// It runs the same hybrid model (exported neighbour lists from train.py) and keeps
// users, ratings, cart, orders and events in localStorage instead of a database.
import bundle from "../demo/bundle.json";

const CAT = new Map(bundle.catalog.map((i) => [i.item_id, i]));
const toMap = (nn) => {
  const m = new Map();
  for (const [k, list] of Object.entries(nn)) m.set(+k, new Map(list));
  return m;
};
const NN_CF = toMap(bundle.nn_cf);
const NN_CB = toMap(bundle.nn_cb);
const POP = new Map(Object.entries(bundle.pop).map(([k, v]) => [+k, v]));
const W = { view: 0.5 / 3, cart: 1.5, purchase: 2.5 };

const KEY = "rm_demo_db_v1";
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
let db = load() || {
  users: [{ id: 1, email: "demo@recomind.app", name: "Demo Shopper", role: "admin", password: "demo1234" }],
  ratings: [], cart: [], orders: [], events: [], session: null,
};
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* storage unavailable */ } };
const delay = (v) => new Promise((r) => setTimeout(() => r(structuredClone(v)), 60));
const fail = (msg) => Promise.reject(new Error(msg));
const me = () => db.users.find((u) => u.id === db.session) || null;
const pub = (u) => u && { id: u.id, email: u.email, name: u.name, role: u.role };
const need = () => { const u = me(); if (!u) throw new Error("Authentication required"); return u; };

const card = (i) => ({
  item_id: i.item_id, name: i.name, class_name: i.class_name, department: i.department, division: i.division,
  price: i.price, avg_rating: i.avg_rating, n_reviews: i.n_reviews, recommend_rate: i.recommend_rate,
  bayes_score: i.bayes_score, keywords: i.keywords,
});

function sim(a, b, alpha, mode) {
  const cf = NN_CF.get(a)?.get(b) || 0;
  const cb = NN_CB.get(a)?.get(b) || 0;
  if (mode === "cf") return cf;
  if (mode === "content") return cb;
  return alpha * cf + (1 - alpha) * cb;
}

function recommend(profile, { k = 12, exclude = new Set(), alpha = 0.3, diversity = 0, mode = "hybrid" } = {}) {
  const prof = Object.entries(profile).map(([i, w]) => [+i, w]).filter(([i, w]) => CAT.has(i) && w !== 0);
  const ex = new Set([...exclude, ...prof.map(([i]) => i)]);
  const scored = [];
  const norm = prof.reduce((s, [, w]) => s + Math.abs(w), 0) || 1;
  for (const id of CAT.keys()) {
    if (ex.has(id)) continue;
    if (mode === "popular" || !prof.length) {
      scored.push({ id, score: POP.get(id), because: null });
      continue;
    }
    let s = 0, best = -Infinity, because = null;
    for (const [j, w] of prof) {
      const c = sim(j, id, alpha, mode) * w;
      s += c;
      if (c > best) { best = c; because = j; }
    }
    scored.push({ id, score: s / norm + 0.05 * POP.get(id), because });
  }
  scored.sort((a, b) => b.score - a.score);
  let chosen = scored.slice(0, k);
  if (diversity > 0 && prof.length) {
    const cand = scored.slice(0, k * 8);
    const lo = cand.at(-1)?.score ?? 0, hi = cand[0]?.score ?? 1;
    const rel = (c) => (c.score - lo) / (hi - lo + 1e-9);
    chosen = [];
    while (cand.length && chosen.length < k) {
      let bi = 0, bv = -Infinity;
      cand.forEach((c, i) => {
        const red = chosen.length ? Math.max(...chosen.map((x) => NN_CB.get(x.id)?.get(c.id) || 0)) : 0;
        const v = (1 - diversity) * rel(c) - diversity * red;
        if (v > bv) { bv = v; bi = i; }
      });
      chosen.push(cand.splice(bi, 1)[0]);
    }
  }
  return chosen.map((c) => ({
    ...card(CAT.get(c.id)), score: +c.score.toFixed(4), because: c.because,
    reason: c.because ? `Because you liked ${CAT.get(c.because).name}` : "Top-rated by shoppers like you",
  }));
}

function profileOf(uid) {
  const p = {};
  const add = (i, w) => { p[i] = (p[i] || 0) + w; };
  db.ratings.filter((r) => r.user_id === uid).forEach((r) => add(r.item_id, r.rating - 3));
  db.cart.filter((c) => c.user_id === uid).forEach((c) => add(c.item_id, W.cart));
  const bought = new Set();
  db.orders.filter((o) => o.user_id === uid).forEach((o) => o.lines.forEach((l) => { bought.add(l.item_id); add(l.item_id, W.purchase); }));
  db.events.filter((e) => e.user_id === uid && e.kind === "view").slice(-30).forEach((e) => add(e.item_id, W.view));
  return { p, bought };
}

const cartPayload = (uid) => {
  const items = db.cart.filter((c) => c.user_id === uid).map((c) => ({ ...card(CAT.get(c.item_id)), quantity: c.quantity }));
  return { items, total: +items.reduce((s, l) => s + l.price * l.quantity, 0).toFixed(2) };
};

export const demo = {
  mode: "demo",
  async login(email, password) {
    const u = db.users.find((x) => x.email === email.trim().toLowerCase() && x.password === password);
    if (!u) return fail("Invalid email or password");
    db.session = u.id; save(); return delay(pub(u));
  },
  async register(name, email, password) {
    email = email.trim().toLowerCase();
    if (!name || !email.includes("@") || password.length < 6) return fail("Name, a valid email and a password of 6+ characters are required");
    if (db.users.some((u) => u.email === email)) return fail("Email already registered");
    const u = { id: Math.max(...db.users.map((x) => x.id)) + 1, email, name, role: "customer", password };
    db.users.push(u); db.session = u.id; save(); return delay(pub(u));
  },
  logout() { db.session = null; save(); },
  async me() { return pub(me()); },
  async products({ q = "", category, department, min_rating, sort = "popular", page = 1, per_page = 24 } = {}) {
    let items = [...CAT.values()];
    if (category) items = items.filter((i) => i.class_name === category);
    if (department) items = items.filter((i) => i.department === department);
    if (min_rating) items = items.filter((i) => i.avg_rating >= +min_rating);
    q = q.trim().toLowerCase();
    if (q) items = items.filter((i) => i.name.toLowerCase().includes(q) || i.keywords.join(" ").includes(q) || i.blurb.toLowerCase().includes(q) || String(i.item_id) === q);
    const key = { popular: (i) => -i.n_reviews, rating: (i) => -i.bayes_score, price_asc: (i) => i.price, price_desc: (i) => -i.price }[sort] || ((i) => -i.n_reviews);
    items.sort((a, b) => key(a) - key(b));
    return delay({ total: items.length, page, per_page, items: items.slice((page - 1) * per_page, page * per_page).map(card) });
  },
  async facets() {
    const v = [...CAT.values()];
    return { categories: [...new Set(v.map((i) => i.class_name))].sort(), departments: [...new Set(v.map((i) => i.department))].sort() };
  },
  async product(id) {
    const it = CAT.get(+id);
    if (!it) return fail("Product not found");
    const u = me();
    if (u) { db.events.push({ user_id: u.id, item_id: +id, kind: "view", at: Date.now() }); save(); }
    const mine = u && db.ratings.find((r) => r.user_id === u.id && r.item_id === +id);
    const similar = recommend({ [id]: 1 }, { k: 8 }).map((s) => ({ ...s, reason: "Shoppers with similar taste also loved this" }));
    return delay({ item: it, similar, my_rating: mine || null });
  },
  async recommendations({ k = 12, alpha = 0.3, diversity = 0.2, mode = "hybrid" } = {}) {
    const u = need();
    const { p, bought } = profileOf(u.id);
    const items = recommend(p, { k, exclude: bought, alpha: +alpha, diversity: +diversity, mode });
    return delay({ cold_start: !Object.values(p).some((w) => w > 0), profile_size: Object.keys(p).length, items });
  },
  async cartRecommend(ids) {
    return delay({ items: recommend(Object.fromEntries(ids.map((i) => [i, 1.5])), { k: 6, diversity: 0.3 }) });
  },
  async ratings() {
    const u = need();
    return delay({ items: db.ratings.filter((r) => r.user_id === u.id).sort((a, b) => b.at - a.at).map((r) => ({ ...r, product: card(CAT.get(r.item_id)) })) });
  },
  async rate(item_id, rating) {
    const u = need();
    const r = db.ratings.find((x) => x.user_id === u.id && x.item_id === +item_id);
    if (r) { r.rating = rating; r.at = Date.now(); } else db.ratings.push({ user_id: u.id, item_id: +item_id, rating, at: Date.now() });
    save(); return delay({ rating: { item_id: +item_id, rating } });
  },
  async unrate(item_id) {
    const u = need();
    db.ratings = db.ratings.filter((x) => !(x.user_id === u.id && x.item_id === +item_id)); save();
    return delay({ status: "deleted" });
  },
  async cart() { return delay(cartPayload(need().id)); },
  async addToCart(item_id, quantity = 1) {
    const u = need();
    const c = db.cart.find((x) => x.user_id === u.id && x.item_id === +item_id);
    if (c) c.quantity += quantity; else db.cart.push({ user_id: u.id, item_id: +item_id, quantity });
    db.events.push({ user_id: u.id, item_id: +item_id, kind: "cart", at: Date.now() });
    save(); return delay(cartPayload(u.id));
  },
  async setQty(item_id, quantity) {
    const u = need();
    if (quantity <= 0) db.cart = db.cart.filter((x) => !(x.user_id === u.id && x.item_id === +item_id));
    else db.cart.find((x) => x.user_id === u.id && x.item_id === +item_id).quantity = quantity;
    save(); return delay(cartPayload(u.id));
  },
  async removeFromCart(item_id) { return demo.setQty(item_id, 0); },
  async checkout() {
    const u = need();
    const lines = db.cart.filter((c) => c.user_id === u.id).map((c) => ({ item_id: c.item_id, quantity: c.quantity, price: CAT.get(c.item_id).price }));
    if (!lines.length) return fail("Cart is empty");
    const order = { id: db.orders.length + 1, user_id: u.id, lines, total: +lines.reduce((s, l) => s + l.price * l.quantity, 0).toFixed(2), created_at: new Date().toISOString() };
    db.orders.push(order);
    lines.forEach((l) => db.events.push({ user_id: u.id, item_id: l.item_id, kind: "purchase", at: Date.now() }));
    db.cart = db.cart.filter((c) => c.user_id !== u.id);
    save(); return delay({ order });
  },
  async orders() { const u = need(); return delay({ items: db.orders.filter((o) => o.user_id === u.id).reverse() }); },
  async analytics() {
    const events = {};
    db.events.forEach((e) => { events[e.kind] = (events[e.kind] || 0) + 1; });
    return delay({ dataset: bundle.eda, evaluation: bundle.metrics, live: { users: db.users.length, ratings: db.ratings.length, orders: db.orders.length, events } });
  },
  async literature(q = "") {
    q = q.toLowerCase();
    const items = bundle.literature.map((r, i) => ({ ...r, id: i + 1 })).filter((r) => !q || Object.values(r).join(" ").toLowerCase().includes(q));
    return delay({ total: items.length, items });
  },
};
export default demo;
