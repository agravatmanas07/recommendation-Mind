// Real backend client (Flask REST API).
const BASE = import.meta.env.VITE_API_URL || "";

const token = () => localStorage.getItem("rm_token");

async function req(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token() ? { Authorization: `Bearer ${token()}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

const qs = (o) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "" && v !== null)).toString();

export const http = {
  mode: "api",
  async login(email, password) {
    const d = await req("/auth/login", { method: "POST", body: { email, password } });
    localStorage.setItem("rm_token", d.token);
    return d.user;
  },
  async register(name, email, password) {
    const d = await req("/auth/register", { method: "POST", body: { name, email, password } });
    localStorage.setItem("rm_token", d.token);
    return d.user;
  },
  logout() { localStorage.removeItem("rm_token"); },
  async me() { return token() ? (await req("/auth/me")).user : null; },
  products: (p) => req(`/products?${qs(p)}`),
  facets: () => req("/products/facets"),
  product: (id) => req(`/products/${id}`),
  recommendations: (p) => req(`/recommendations?${qs(p)}`),
  cartRecommend: (items) => req("/recommendations/cart", { method: "POST", body: { items } }),
  ratings: () => req("/ratings"),
  rate: (item_id, rating) => req("/ratings", { method: "POST", body: { item_id, rating } }),
  unrate: (item_id) => req(`/ratings/${item_id}`, { method: "DELETE" }),
  cart: () => req("/cart"),
  addToCart: (item_id, quantity = 1) => req("/cart", { method: "POST", body: { item_id, quantity } }),
  setQty: (item_id, quantity) => req(`/cart/${item_id}`, { method: "PATCH", body: { quantity } }),
  removeFromCart: (item_id) => req(`/cart/${item_id}`, { method: "DELETE" }),
  checkout: () => req("/checkout", { method: "POST", body: {} }),
  orders: () => req("/orders"),
  analytics: () => req("/analytics/overview"),
  literature: (q) => req(`/literature?${qs({ q })}`),
};
export default http;
