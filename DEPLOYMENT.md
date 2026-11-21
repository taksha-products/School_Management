# Deployment guide

What a production deployment of the platform (backend, frontend, Traccar GPS server) needs.
Everything here was checked by building the real Docker images and running them in
`NODE_ENV=production` against MongoDB, Redis and Traccar.

## Components

| Part | How it runs | Notes |
|---|---|---|
| Backend (Express + Socket.IO) | `backend/Dockerfile`, or Render (`backend/render.yaml`) | Port 5000, health check `GET /api/health` |
| Frontend (Next.js) | `frontend/Dockerfile` | Port 3000 |
| MongoDB | Managed (Atlas) | Required |
| Redis | Managed or the compose service | Optional, but needed for live map updates and caching |
| Traccar | `traccar/traccar:6.17.0` (see `docker-compose.yml`) | Receives GPS devices; the backend manages its devices through its API |

## Environment variables (backend)

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV=production` | Yes | Enables rate limits, secure cookies, fail-closed webhook. An env file that sets `development` overrides the image default |
| `MONGO_URI` | Yes | Database |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Yes | Must differ from each other |
| `TOTP_ENCRYPTION_KEY` | Yes | 64 hex characters |
| `FRONTEND_URL` | Yes | Allowed browser origin(s), comma separated |
| `REDIS_URL` | Recommended | Live updates and caching |
| `COOKIE_DOMAIN` | If frontend and API use different hosts | Parent domain (for example `.school.com`) so the login cookie reaches the API directly. Needed for the live-tracking socket |
| `TRACCAR_URL` | For GPS | Traccar address as the backend reaches it (`http://traccar:8082` in compose) |
| `TRACCAR_TOKEN` or `TRACCAR_USER` + `TRACCAR_PASSWORD` | For GPS | A Traccar admin account used to register buses' trackers |
| `TRACCAR_WEBHOOK_SECRET` | **Yes, for GPS** | Traccar must send it as `?key=`. Without it the webhook refuses every position in production |
| `GPS_STORE_RAW_PAYLOAD` | No | `true` keeps raw Traccar payloads (debugging only; bulky) |

## Frontend build arguments

`NEXT_PUBLIC_BACKEND_URL` is compiled into the browser bundle, so it must be a **build argument**, not a runtime variable:

```
docker build ./frontend \
  --build-arg BACKEND_URL=http://backend:5000 \
  --build-arg NEXT_PUBLIC_BACKEND_URL=https://api.example.com
```

`BACKEND_URL` (the address the Next.js server uses to reach the API) defaults to the build value at runtime and can be overridden with `-e BACKEND_URL=...`.

## Staging on the Oracle VM (docker-compose.dev-nginx.yml)

- nginx serves the site, the API and `/socket.io/` on **one address**, so the login cookie reaches the live socket. The frontend image is built without `NEXT_PUBLIC_BACKEND_URL`, and the browser then uses its own origin (no build argument needed in CI).
- The compose file includes Traccar (amd64 and arm64). Add `TRACCAR_WEBHOOK_SECRET` and `TRACCAR_TOKEN` to the server `.env`. Until then GPS is inactive and everything else works.
- Traccar's web UI is bound to `127.0.0.1:8082`: reach it with `ssh -L 8082:127.0.0.1:8082 user@vm`, create the admin account, generate a token (account menu, Preferences, Token), put it in `.env`, and restart the backend.
- Open the tracker port(s) in both the cloud security list and the VM firewall: 5055 for the Traccar Client phone app, plus your hardware's port.

## Requirements and behaviour to know

- **HTTPS.** In production the login cookies are `Secure; SameSite=Strict`; browsers refuse them over plain HTTP. For a local HTTP test only, set `COOKIE_SECURE=false`.
- **Reverse proxy.** The backend trusts one proxy hop (`trust proxy 1`) for client IPs.
- **Rate limits** (production only): 200 requests per 15 minutes per IP for general API calls. Exempt: `/api/health`, the Traccar webhook (protected by its secret plus a lockout after 30 wrong secrets), and the live-tracking poll endpoints (limited to 60 per minute per signed-in user instead).
- **Live map.** The admin map uses a socket for instant updates and falls back to polling every 15 seconds when the socket is unavailable.
- **Several backend instances.** Live updates fan out through Redis. If Socket.IO falls back to HTTP long-polling behind a load balancer, enable sticky sessions. The webhook lockout counter is per instance.
- **Index sync.** On startup the backend syncs critical indexes for buses, GPS devices, students and users (dropping obsolete ones).
- **Position history** is deleted automatically after 30 days (TTL index).

## Traccar in production

- Pin the image version (done) and upgrade deliberately.
- The default embedded database is for testing. Configure MySQL or PostgreSQL for production and back it up.
- Open only the device port(s) your tracker model uses (compose publishes 5055 for the phone app and 5027 as an example). Keep the web UI/API (8082) private or behind HTTPS.
- Disable open self-registration in Traccar after creating the admin account.
- Traccar forwards positions to `…/api/traccar-webhook/webhook/traccar?key=<TRACCAR_WEBHOOK_SECRET>` (compose sets this from `TRACCAR_WEBHOOK_SECRET`).

## Before going live

- [ ] Change or remove the seeded demo accounts and passwords (never run the seed against production).
- [ ] Set every required variable above; `NODE_ENV=production`.
- [ ] Put the stack behind HTTPS.
- [ ] Create the Traccar admin, add its token to the backend, set the webhook secret in both places.
- [ ] Turn on `gpsTracking` for the schools that should use it (super admin screen).
- [ ] Add a real tracker (or a phone with Traccar Client) to one bus and watch it on the live map.
- [ ] Set up MongoDB and Traccar backups.
