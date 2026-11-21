# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Used at build time for Next.js rewrites / edge middleware defaults
ARG BACKEND_URL=http://backend:5000
ENV BACKEND_URL=${BACKEND_URL}
# NEXT_PUBLIC_* values are inlined into the browser bundle at build time, so they must be
# build arguments (a runtime environment variable would have no effect on the client).
# Public URL of the API as the browser reaches it (used by the live-tracking socket).
# Leave empty when a reverse proxy serves the site and the API on one address (the browser
# then uses its own origin); set it only when the API lives on a different address.
ARG NEXT_PUBLIC_BACKEND_URL=
ENV NEXT_PUBLIC_BACKEND_URL=${NEXT_PUBLIC_BACKEND_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
# The edge middleware reads BACKEND_URL when the container runs (not only at build time).
# Default it to the value used at build; override at runtime with -e / the compose environment.
ARG BACKEND_URL=http://backend:5000
ENV BACKEND_URL=${BACKEND_URL}
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -S taksha && adduser -S taksha -G taksha

COPY --from=build /app/package.json ./package.json
COPY --from=build /app/package-lock.json ./package-lock.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.mjs ./next.config.mjs

USER taksha
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=40s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/login').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start"]
