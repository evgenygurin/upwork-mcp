# ─── Build stage ──────────────────────────────────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src

RUN npm run build

# ─── Runtime stage ────────────────────────────────────────────────────────────
FROM node:20-slim AS runtime

# Install Chromium dependencies for Playwright
RUN apt-get update && apt-get install -y --no-install-recommends \
    # Chromium
    chromium \
    # Fonts
    fonts-liberation \
    fonts-noto-color-emoji \
    # Libraries
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libatspi2.0-0 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libdrm2 \
    libexpat1 \
    libgbm1 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libnss3 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxkbcommon0 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Tell Playwright to use the system Chromium instead of downloading its own
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./

# Sessions directory for persistent login
RUN mkdir -p /app/sessions && chmod 755 /app/sessions

# Non-root user for security
RUN groupadd -r mcpuser && useradd -r -g mcpuser -G audio,video mcpuser \
    && chown -R mcpuser:mcpuser /app
USER mcpuser

# MCP communicates over stdio
CMD ["node", "dist/index.js"]
