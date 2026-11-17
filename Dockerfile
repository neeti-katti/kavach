# Kavach: one container serving the web app and the API.
#   docker build -t kavach .
#   docker run -p 8000:8000 kavach        then open http://localhost:8000

# 1. Build the web app
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./
RUN npm run build

# 2. Run the API, which also serves the built web app
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    KAVACH_FRONTEND_DIST=/app/frontend/dist \
    KAVACH_DEMO_MODE=1 \
    KAVACH_LOAD_DEMO=1 \
    PORT=8000
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ ./
COPY --from=web /web/dist /app/frontend/dist
# Run as an unprivileged user; data and keys are created at start-up (synthetic demo data only).
RUN useradd --create-home kavach && mkdir -p data keys && chown -R kavach /app
USER kavach
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --proxy-headers --forwarded-allow-ips='*'"]
