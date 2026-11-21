# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG BACKEND_URL=http://backend:5000
ENV BACKEND_URL=${BACKEND_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# Production runner — standalone output only (no eslint/devDeps in the image)
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S taksha && adduser -S taksha -G taksha

COPY --from=build /app/public ./public
COPY --from=build --chown=taksha:taksha /app/.next/standalone ./
COPY --from=build --chown=taksha:taksha /app/.next/static ./.next/static

USER taksha
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/parent/login').then((r)=>process.exit(r.ok||r.status===307||r.status===302?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
