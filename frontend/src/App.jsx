import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { HashRouter, Link, NavLink, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { api } from "./api";
import Shop from "./pages/Shop";
import Product from "./pages/Product";
import ForYou from "./pages/ForYou";
import Cart from "./pages/Cart";
import Insights from "./pages/Insights";
import Research from "./pages/Research";
import Auth from "./pages/Auth";

const Ctx = createContext(null);
export const useApp = () => useContext(Ctx);

const LINKS = [["/", "Shop"], ["/for-you", "For you"], ["/insights", "Model insights"], ["/research", "Research"]];

function Nav() {
  const { user, cartCount, logout } = useApp();
  const nav = useNavigate();
  return (
    <>
      {api.mode === "demo" && (
        <div className="demo-banner">
          <b>Live demo</b> · the hybrid recommender runs in your browser · sign in as <b>demo@recomind.app</b> / <b>demo1234</b>
        </div>
      )}
      <header className="nav">
        <div className="wrap">
          <Link to="/" className="brand">Reco<b>Mind</b></Link>
          <nav className="nav-links">
            {LINKS.map(([to, l]) => <NavLink key={to} to={to} end>{l}</NavLink>)}
          </nav>
          <div className="nav-right">
            {user ? (
              <>
                <span className="muted">Hi, {user.name.split(" ")[0]}</span>
                <button className="btn ghost sm" onClick={() => { logout(); nav("/"); }}>Sign out</button>
              </>
            ) : (
              <Link to="/login" className="btn ghost sm">Sign in</Link>
            )}
            <Link to="/cart" className="cart-pill">Bag <span>{cartCount}</span></Link>
          </div>
        </div>
      </header>
      <div className="mobile-nav">{LINKS.map(([to, l]) => <NavLink key={to} to={to} end>{l}</NavLink>)}</div>
    </>
  );
}

function RequireUser({ children }) {
  const { user, ready } = useApp();
  if (!ready) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2200);
  }, []);
  const refreshCart = useCallback(async () => {
    try {
      const c = await api.cart();
      setCartCount(c.items.reduce((s, l) => s + l.quantity, 0));
    } catch { setCartCount(0); }
  }, []);

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null)).finally(() => setReady(true));
  }, []);
  useEffect(() => { if (user) refreshCart(); else setCartCount(0); }, [user, refreshCart]);

  const value = {
    user, ready, cartCount, notify, refreshCart,
    setUser,
    logout: () => { api.logout(); setUser(null); },
  };

  return (
    <Ctx.Provider value={value}>
      <HashRouter>
        <Nav />
        <main className="wrap">
          <Routes>
            <Route path="/" element={<Shop />} />
            <Route path="/product/:id" element={<Product />} />
            <Route path="/for-you" element={<RequireUser><ForYou /></RequireUser>} />
            <Route path="/cart" element={<RequireUser><Cart /></RequireUser>} />
            <Route path="/insights" element={<Insights />} />
            <Route path="/research" element={<Research />} />
            <Route path="/login" element={<Auth mode="login" />} />
            <Route path="/register" element={<Auth mode="register" />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
        <footer>
          <div className="wrap">
            RecoMind — Product Recommendation Based on Consumer Behavior · Master's final-year project ·
            Hybrid SVD collaborative filtering + TF-IDF content model on the Women's E-Commerce Clothing Reviews dataset (Kaggle).
            Product names, prices and images are synthetic.
          </div>
        </footer>
        {toast && <div className="toast">{toast}</div>}
      </HashRouter>
    </Ctx.Provider>
  );
}
