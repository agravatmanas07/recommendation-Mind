import { Link } from "react-router-dom";

// The dataset has no images, so each product gets a deterministic illustrated "swatch":
// a garment silhouette by class on a fabric colour derived from its ID.
const PALETTES = [
  ["#e9d8c4", "#b4532a"], ["#dfe3d8", "#3d6b4f"], ["#e6dbe4", "#7a4b6e"], ["#dbe2ea", "#36526e"],
  ["#efe1cf", "#8a5a2b"], ["#e3e0d9", "#3b3632"], ["#f0dcd4", "#a2453a"], ["#dde6e3", "#2f6260"],
];
const SHAPES = {
  dress: "M80 30 L100 38 L120 30 L126 62 L114 70 L146 190 L54 190 L86 70 L74 62 Z",
  top: "M70 40 L90 32 Q100 44 110 32 L130 40 L150 70 L134 80 L128 70 L128 150 L72 150 L72 70 L66 80 L50 70 Z",
  pants: "M70 34 L130 34 L136 190 L108 190 L100 92 L92 190 L64 190 Z",
  skirt: "M74 50 L126 50 L148 170 L52 170 Z",
  jacket: "M68 36 L92 30 L100 60 L108 30 L132 36 L156 80 L140 88 L134 76 L134 176 L66 176 L66 76 L60 88 L44 80 Z",
  swim: "M74 44 L86 44 Q100 70 114 44 L126 44 L128 96 Q100 110 72 96 Z M72 112 Q100 124 128 112 L124 150 Q100 140 76 150 Z",
  small: "M60 60 Q100 30 140 60 L140 150 Q100 170 60 150 Z",
};
const shapeFor = (cls) =>
  ({ Dresses: "dress", Skirts: "skirt", Pants: "pants", Jeans: "pants", Shorts: "pants", "Casual bottoms": "pants",
     Jackets: "jacket", Outerwear: "jacket", Swim: "swim", Intimates: "swim", Legwear: "small" }[cls] || "top");

export function ProductArt({ item }) {
  const [bg, fg] = PALETTES[item.item_id % PALETTES.length];
  const pattern = item.item_id % 3;
  const pid = `p${item.item_id}`;
  return (
    <svg viewBox="0 0 200 250" role="img" aria-label={item.name}>
      <defs>
        <pattern id={pid} width="12" height="12" patternUnits="userSpaceOnUse" patternTransform={`rotate(${(item.item_id * 17) % 90})`}>
          {pattern === 0 && <circle cx="6" cy="6" r="1.6" fill="#fff" opacity=".35" />}
          {pattern === 1 && <rect width="4" height="12" fill="#fff" opacity=".18" />}
        </pattern>
      </defs>
      <rect width="200" height="250" fill={bg} />
      <circle cx="160" cy="40" r="70" fill="#fff" opacity=".25" />
      <g transform="translate(0,20)">
        <path d={SHAPES[shapeFor(item.class_name)]} fill={fg} />
        <path d={SHAPES[shapeFor(item.class_name)]} fill={`url(#${pid})`} />
      </g>
      <text x="14" y="236" fontFamily="Georgia, serif" fontSize="11" fill={fg} opacity=".8">No. {item.item_id}</text>
    </svg>
  );
}

export const Stars = ({ value }) => (
  <span className="stars" title={`${value} / 5`}>
    {"★★★★★".slice(0, Math.round(value))}<span style={{ color: "var(--line)" }}>{"★★★★★".slice(Math.round(value))}</span>
  </span>
);

export function ProductCard({ item, showReason }) {
  return (
    <Link to={`/product/${item.item_id}`} className="pcard fade">
      <div className="img">
        <ProductArt item={item} />
        {item.recommend_rate >= 0.9 && <span className="badge">{Math.round(item.recommend_rate * 100)}% recommend</span>}
      </div>
      <div className="name">{item.name}</div>
      <div className="meta">
        <span><Stars value={item.avg_rating} /> <span className="faint">({item.n_reviews})</span></span>
        <strong>${item.price.toFixed(2)}</strong>
      </div>
      {showReason && item.reason && <div className="reason">{item.reason}</div>}
    </Link>
  );
}

export const Empty = ({ children }) => <div className="empty">{children}</div>;
