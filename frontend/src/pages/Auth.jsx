import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";

export default function Auth({ mode }) {
  const { setUser, notify } = useApp();
  const nav = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const login = mode === "login";

  const submit = async (e, demo) => {
    e?.preventDefault();
    setErr(""); setBusy(true);
    try {
      const u = demo ? await api.login("demo@recomind.app", "demo1234")
        : login ? await api.login(f.email, f.password) : await api.register(f.name, f.email, f.password);
      setUser(u);
      notify(`Welcome, ${u.name.split(" ")[0]}`);
      nav("/for-you");
    } catch (x) { setErr(x.message); } finally { setBusy(false); }
  };
  const field = (k, label, type = "text") => (
    <label className="field">{label}<input className="input" type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} required /></label>
  );

  return (
    <form className="auth panel fade" onSubmit={submit}>
      <h2>{login ? "Sign in" : "Create an account"}</h2>
      <div className="faint">{login ? "Your ratings, bag and orders build your recommendation profile." : "New accounts start cold — the system falls back to popularity until you interact."}</div>
      {!login && field("name", "Name")}
      {field("email", "Email", "email")}
      {field("password", "Password (6+ characters)", "password")}
      {err && <div className="error">{err}</div>}
      <button className="btn" disabled={busy}>{login ? "Sign in" : "Create account"}</button>
      {login && <button type="button" className="btn ghost" onClick={(e) => submit(e, true)} disabled={busy}>Use the demo account</button>}
      <div className="faint" style={{ textAlign: "center" }}>
        {login ? <>No account? <Link to="/register" style={{ color: "var(--accent)" }}>Register</Link></> : <>Already registered? <Link to="/login" style={{ color: "var(--accent)" }}>Sign in</Link></>}
      </div>
    </form>
  );
}
