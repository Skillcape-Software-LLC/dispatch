# Dispatch

[![CI](https://github.com/skillcape-software/dispatch/actions/workflows/ci.yml/badge.svg)](https://github.com/skillcape-software/dispatch/actions/workflows/ci.yml)

Lightweight, containerized HTTP testing tool. The anti-Postman.

- Collections with folders, drag-and-drop ordering, and variables
- Environments with variable interpolation (`{{variable}}`)
- Request history with auto-pruning
- cURL import and code generation (cURL, JavaScript fetch, Python requests, C# HttpClient, PowerShell)
- Tabbed workspaces
- Monaco-powered JSON editor with syntax highlighting
- Dark theme (Bootstrap 5.3)
- Keyboard shortcuts for everything
- Single Docker container — no accounts, no cloud, no sync

## Quick Start

```bash
docker run -p 3000:3000 -v dispatch-data:/data ghcr.io/skillcape-software/dispatch:latest
```

Or with Docker Compose:

```bash
docker compose up
```

Open [http://localhost:3000](http://localhost:3000)

## Development

```bash
npm install
npm run dev
```

- Angular dev server: http://localhost:4200
- Fastify API: http://localhost:4000
- Health check: http://localhost:4000/api/health

## Architecture

Dispatch is a monorepo with two apps. The **Angular 19 SPA** (`client/`) talks to a **Fastify REST API** (`server/`) that acts as an HTTP proxy — all user requests go through the server to avoid CORS issues, handle auth, and capture accurate timing. Data is stored in **LokiJS**, an embedded NoSQL database that persists to a single JSON file on disk. In production, Fastify serves the Angular build as static files inside a single Docker container.

## Configuration

| Variable    | Default  | Description            |
|-------------|----------|------------------------|
| `PORT`      | `3000`   | Server port (prod)     |
| `DATA_DIR`  | `./data` | LokiJS data directory  |
| `LOG_LEVEL` | `info`   | Pino log level         |

Settings can also be configured in-app via the settings modal (gear icon), including request timeout, history limit, SSL verification, and proxy log level.

## Keyboard Shortcuts

| Shortcut         | Action                      |
|------------------|-----------------------------|
| `Ctrl+Enter`     | Send request                |
| `Ctrl+S`         | Save request to collection  |
| `Ctrl+N`         | New tab                     |
| `Ctrl+W`         | Close tab                   |
| `Ctrl+E`         | Focus environment selector  |
| `Ctrl+/`         | Show keyboard shortcuts     |

## Data Persistence

Data is stored in `/data/dispatch.db.json` inside the container. Mount a volume to persist across restarts:

```bash
docker run -p 3000:3000 -v dispatch-data:/data dispatch
```

### Backup & Restore

To back up, copy the database file from the volume:

```bash
docker cp $(docker ps -qf name=dispatch):/data/dispatch.db.json ./backup.json
```

To restore, copy it back:

```bash
docker cp ./backup.json $(docker ps -qf name=dispatch):/data/dispatch.db.json
```

Then restart the container to pick up the restored data.

## Docker Log Rotation

The Docker Compose file includes log rotation by default (10 MB, 3 files). For standalone `docker run`, add:

```bash
docker run -p 3000:3000 -v dispatch-data:/data \
  --log-opt max-size=10m --log-opt max-file=3 \
  dispatch
```
