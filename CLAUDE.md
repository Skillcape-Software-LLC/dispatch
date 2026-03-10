# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is Dispatch?

Lightweight, containerized HTTP testing tool (Postman alternative). Single Docker container, browser UI at localhost:3000. Local-first, single-user, no cloud sync.

## Architecture

Monorepo with two apps:
- **`client/`** — Angular 19+ SPA (Bootstrap 5.3 dark theme, Bootstrap Icons, Monaco Editor)
- **`server/`** — Node.js + Fastify REST API (TypeScript)
- **Storage:** LokiJS embedded NoSQL, persists to JSON files at `/data/dispatch.db.json`
- **Distribution:** Single Docker container via multi-stage build (Node Alpine)

The server acts as an HTTP proxy (`POST /api/proxy`) so the browser avoids CORS. In production, Fastify serves the Angular build as static files. In dev, Angular runs its own dev server with a proxy config routing `/api` to Fastify.

## Build & Dev Commands

```bash
# Development — starts Angular dev server + Fastify in watch mode concurrently
npm run dev

# Docker
docker compose up                    # serves at localhost:3000
docker run -p 3000:3000 dispatch     # standalone

# Individual apps (from their directories)
cd client && ng serve                # Angular dev server
cd server && npm run dev             # Fastify with watch mode
```

## Key Design Decisions

- **Server-side HTTP proxy** — all user requests go through Fastify to avoid CORS, handle auth, and capture accurate timing
- **LokiJS** — file-based NoSQL, no external DB dependency. JSON files can be backed up by copying
- **Monaco Editor** — used for JSON body input and response viewing
- **Variable interpolation** — `{{variableName}}` resolved server-side. Resolution order: collection variables → active environment variables
- **Angular proxy config** — local dev proxies `/api` to Fastify backend (default port 4000)

## Data Model

Four LokiJS collections: `requests`, `collections`, `environments`, `history`. All entities are UUID-identified JSON documents. See `IMPLEMENTATION_PLAN.md` for full schemas.

## Implementation Phases

8-phase plan in `IMPLEMENTATION_PLAN.md`. Phases 4 (Environments) and 5 (History) can run in parallel. Design mockups are in `design/` as standalone HTML files.

## Style & Theming

- Bootstrap 5.3 with dark mode as default
- Design mockups in `design/STYLE_GUIDE.html`, `design/MOCKUP_MAIN.html`, `design/MOCKUP_TABS.html`, `design/MOCKUP_IMPORT.html`
- Bootstrap Icons for iconography
- Status code color convention: 2xx green, 3xx blue, 4xx yellow, 5xx red

## Configuration

Environment variable overrides: `PORT`, `DATA_DIR`, `LOG_LEVEL`. Config precedence: env vars → settings file → defaults.
