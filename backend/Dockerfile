# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json tsconfig.json ./
COPY src ./src
RUN npx tsc -p tsconfig.json

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=5000

RUN addgroup -S taksha && adduser -S taksha -G taksha

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY public ./public

RUN mkdir -p public/logos && chown -R taksha:taksha /app

USER taksha
EXPOSE 5000

HEALTHCHECK --interval=15s --timeout=5s --start-period=25s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:5000/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/server.js"]
