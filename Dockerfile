FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# ── Runtime ──────────────────────────────────────────────────────────────────
FROM node:22-alpine
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/sessions

# Playwright connects to Chrome on HOST via CDP — no browser needed inside container
ENV CDP_HOST=host.docker.internal
ENV CDP_PORT=9222
ENV WORKER_PORT=47821
ENV NODE_ENV=production

EXPOSE 47821

CMD ["node", "dist/worker.js"]
