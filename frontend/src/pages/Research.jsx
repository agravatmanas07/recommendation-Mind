import { Fragment, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../api";
import { Empty } from "../components/ui";

const axis = { fontSize: 12, fill: "#8f877d" };

export default function Research() {
  const [all, setAll] = useState([]);
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState("");
  const [open, setOpen] = useState(null);
  useEffect(() => { api.literature("").then((d) => setAll(d.items)); }, []);

  const themes = useMemo(() => {
    const c = {};
    all.forEach((r) => r.Framework.split(",").map((s) => s.trim()).filter(Boolean).forEach((t) => { c[t] = (c[t] || 0) + 1; }));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [all]);
  const years = useMemo(() => {
    const c = {};
    all.forEach((r) => { const y = /^\d{4}$/.test(r["Publication Year"]) ? r["Publication Year"] : "n.d."; c[y] = (c[y] || 0) + 1; });
    return Object.entries(c).sort().map(([year, papers]) => ({ year, papers }));
  }, [all]);
  const rows = all.filter((r) =>
    (!theme || r.Framework.includes(theme)) && (!q || Object.values(r).join(" ").toLowerCase().includes(q.toLowerCase())));

  return (
    <>
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="kicker">Chapter 2 · State of the art</div>
        <h1 style={{ fontSize: 40 }}>Literature review</h1>
        <p className="muted" style={{ maxWidth: 720 }}>
          The {all.length} studies from the project's review matrix, searchable by framework, objective and method.
          The themes that recur here — collaborative filtering, hybrid models, explainability and diversity — are the ones this system implements.
        </p>
      </section>
      <section className="cols-2">
        <div className="panel">
          <h3>Most frequent frameworks</h3>
          <div className="chips" style={{ marginTop: 12 }}>
            <button className={`chip ${!theme ? "on" : ""}`} onClick={() => setTheme("")}>All</button>
            {themes.slice(0, 18).map(([t, n]) => <button key={t} className={`chip ${theme === t ? "on" : ""}`} onClick={() => setTheme(t)}>{t} · {n}</button>)}
          </div>
        </div>
        <div className="panel">
          <h3>Studies by publication year</h3>
          <div style={{ height: 180, marginTop: 10 }}>
            <ResponsiveContainer>
              <BarChart data={years} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <XAxis dataKey="year" tick={axis} /><YAxis tick={axis} allowDecimals={false} /><Tooltip />
                <Bar dataKey="papers" fill="#b4532a" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>
      <section className="section">
        <input className="input" style={{ maxWidth: 420, marginBottom: 16 }} placeholder="Search authors, methods, objectives…" value={q} onChange={(e) => setQ(e.target.value)} />
        {rows.length === 0 ? <Empty>No studies match.</Empty> : (
          <div className="panel" style={{ padding: 0, overflowX: "auto" }}>
            <table>
              <thead><tr><th>Objective</th><th>Authors</th><th>Year</th><th>Type</th><th>Framework</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <Fragment key={r.id}>
                    <tr className="paper-row" style={{ cursor: "pointer" }} onClick={() => setOpen(open === r.id ? null : r.id)}>
                      <td>{r.Objective}</td>
                      <td className="muted">{r.Authors}</td>
                      <td>{r["Publication Year"]}</td>
                      <td className="faint">{r["Item Type"]}</td>
                      <td>{r.Framework.split(",").map((t) => <span key={t} className="tag">{t.trim()}</span>)}</td>
                    </tr>
                    {open === r.id && (
                      <tr>
                        <td colSpan={5} style={{ background: "var(--paper)" }}>
                          <div className="cols-2" style={{ gridTemplateColumns: "1fr 1fr 1fr", fontSize: 14 }}>
                            <div><b>Design / methodology</b><p className="muted">{r["Design/Methodology"]}</p></div>
                            <div><b>Results & discussion</b><p className="muted">{r["Results and Discussion"]}</p></div>
                            <div><b>Limitations</b><p className="muted">{r["Limitations/Assumptions"]}</p></div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
