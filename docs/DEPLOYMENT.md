# Deployment guide

## Option A: Render (recommended, free tier, full stack + PostgreSQL)
1. Push the project to a GitHub repository.
2. Go to https://dashboard.render.com → **New → Blueprint** → select the repository.
3. Render reads `render.yaml`, builds the `Dockerfile` (React build + Flask/gunicorn) and creates a Postgres database. `SECRET_KEY` and `DATABASE_URL` are set automatically.
4. When the build finishes, the app is live at `https://recomind-xxxx.onrender.com`. Check `/api/health`.

The free tier sleeps after 15 minutes without traffic, so the first request afterwards takes about 30 s. Open the site a minute before you present.

## Option B: Railway / Fly.io / any Docker host
```bash
docker build -t recomind .
docker run -p 5000:5000 -e SECRET_KEY=$(openssl rand -hex 32) -e DATABASE_URL=postgresql+psycopg2://user:pass@host/db recomind
```
Without `DATABASE_URL` the app uses SQLite inside the container. Data is then lost on redeploy.

## Option C: local production stack
`docker compose up --build` → http://localhost:5000 (app + PostgreSQL 16 with a persistent volume).

## Option D: static live demo (no server)
`cd frontend && npm run build:demo` produces `dist-demo/index.html`, a single self-contained file in which the trained hybrid model runs in the browser and user data is kept in localStorage. Host it on GitHub Pages, Netlify Drop or Vercel by uploading that one file.

## Split hosting (frontend on Vercel, API on Render)
Build the frontend with `VITE_API_URL=https://your-api.onrender.com npm run build` and set `CORS_ORIGINS=https://your-frontend.vercel.app` on the API.

## Environment variables
| Variable | Default | Purpose |
|---|---|---|
| `SECRET_KEY` | dev value | JWT signing key (**set in production**) |
| `DATABASE_URL` | `sqlite:///backend/data/app.db` | SQLAlchemy URL; `postgres://` URLs are converted automatically |
| `CORS_ORIGINS` | `*` | Comma-separated allowed origins |
| `JWT_EXPIRES_HOURS` | `72` | Token lifetime |
| `SEED_DEMO_USER` | `1` | Creates `demo@recomind.app` / `demo1234` |
