# SupportIQ — Reproducible Multi-Stage Production Container
# Baseline: Node.js 24 LTS Alpine

# Stage 1: Monorepo Dependency Installation
FROM node:24-alpine AS dependencies
WORKDIR /app

# Copy root manifests and workspace manifests to enable reproducible npm ci
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci

# Stage 2: Frontend Asset Compilation
FROM node:24-alpine AS frontend-builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/frontend/node_modules ./frontend/node_modules
COPY package.json package-lock.json ./
COPY frontend/ ./frontend/

RUN npm --prefix frontend run build

# Stage 3: Backend TypeScript Compilation
FROM node:24-alpine AS backend-builder
WORKDIR /app

COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=dependencies /app/backend/node_modules ./backend/node_modules
COPY package.json package-lock.json ./
COPY backend/ ./backend/

RUN npm --prefix backend run build

# Stage 4: Production-Only Dependencies
FROM node:24-alpine AS prod-dependencies
WORKDIR /app

COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm ci --omit=dev

# Stage 5: Minimal Production Runtime
FROM node:24-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000
ENV TRUST_PROXY=false
ENV SERVE_STATIC_FRONTEND=true

# Copy production dependencies
COPY --from=prod-dependencies /app/node_modules ./node_modules
COPY --from=prod-dependencies /app/backend/node_modules ./backend/node_modules
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/

# Copy compiled backend and knowledge base
COPY --from=backend-builder /app/backend/dist ./backend/dist
COPY backend/knowledge-base ./backend/knowledge-base

# Copy compiled static frontend assets
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Security: Run as non-root unprivileged node user
USER node

EXPOSE 4000

CMD ["node", "backend/dist/server.js"]

