# syntax=docker/dockerfile:1.7

# Node-Version exakt gepinnt, nicht `node:24-alpine`: Das Image wird nur bei
# einem Push auf main gebaut. Mit dem Sammel-Tag kam ein Node-Sicherheitspatch
# erst mit dem nächsten Merge in Produktion, und niemand sah, welche Version
# lief. 24.22.1 schließt die Lücken vom 21.10.2026, darunter CVE-2026-111497:
# Der Brotli-Decoder, den safeTarget.ts auf Antworten fremder Websites
# anwendet, schreibt dort über Puffergrenzen. Neue Versionen kommen per
# Dependabot (docker); die CI (container.yml) muss dieselbe Version nutzen.
FROM node:24.22.1-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY index.html diggy-icon.svg tsconfig.json tsconfig.node.json tsconfig.server.json vite.config.ts ./
COPY src ./src
# Statische Dateien ohne Hash im Namen, z. B. das Vorschaubild für Permalinks.
COPY public ./public
COPY server ./server
COPY shared ./shared
RUN npm run build

FROM node:24.22.1-alpine AS runtime
WORKDIR /app

ENV NODE_ENV=production \
    PORT=3001

COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force

COPY --from=build --chown=node:node /app/dist ./dist
COPY --from=build --chown=node:node /app/dist-server ./dist-server

USER node
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + process.env.PORT + '/api/health').then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"

CMD ["node", "dist-server/server/index.js"]
