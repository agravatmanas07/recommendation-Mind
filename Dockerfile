# ---------- 1. build the React frontend ----------
FROM node:22-alpine AS web
WORKDIR /web
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npx vite build --outDir /web/dist

# ---------- 2. Python API + trained model ----------
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PORT=5000
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
# retrain if artifacts are missing (they are committed, so this is normally a no-op)
RUN test -f artifacts/model.npz || python train.py --skip-figures
COPY --from=web /web/dist ./static
EXPOSE 5000
CMD gunicorn -w 2 -b 0.0.0.0:${PORT} --timeout 120 wsgi:app
