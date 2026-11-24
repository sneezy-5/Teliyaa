# ---------- 1. Construire le site (Vue) ----------
FROM node:20-alpine AS web
WORKDIR /app
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi
COPY . .
# Adresse publique (liens partagés), ex. https://teliyaa.com
ARG PUBLIC_URL=""
ENV VITE_API_URL="" \
    VITE_PUBLIC_URL=$PUBLIC_URL
RUN npx vite build

# ---------- 2. Dépendances du serveur ----------
FROM node:20-alpine AS deps
WORKDIR /srv
COPY server/package.json server/package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci --omit=dev; else npm install --omit=dev; fi

# ---------- 3. Image finale : serveur + site ----------
FROM node:20-alpine
WORKDIR /srv
ENV NODE_ENV=production \
    PORT=3000 \
    STATIC_DIR=/srv/public \
    TRUST_PROXY=1
COPY --from=deps /srv/node_modules ./node_modules
COPY server/package.json ./
COPY server/src ./src
COPY --from=web /app/dist ./public
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:3000/ >/dev/null || exit 1
CMD ["node", "src/index.js"]
