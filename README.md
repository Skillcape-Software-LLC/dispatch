# Dispatch

Lightweight, containerized HTTP testing tool. The anti-Postman.

## Quick Start

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

## Configuration

| Variable   | Default | Description           |
|------------|---------|----------------------|
| `PORT`     | `3000`  | Server port (prod)    |
| `DATA_DIR` | `./data`| LokiJS data directory |
| `LOG_LEVEL`| `info`  | Pino log level        |

## Data Persistence

Data is stored in `/data/dispatch.db.json` inside the container. Mount a volume to persist across restarts:

```bash
docker run -p 3000:3000 -v dispatch-data:/data dispatch
```
