# Server deployment

Runs the POS server (API + admin frontend) and Postgres with Docker Compose.

## First setup

```bash
cd deploy
cp .env.example .env     # set ADMIN_PIN and POSTGRES_PASSWORD
docker compose up -d
```

The server is then reachable on `POS_PORT` (default 3001). Postgres is not
published to the host.

## Update

```bash
docker compose pull && docker compose up -d
```

## Pinning a version

Set `POS_TAG` in `.env` (e.g. `POS_TAG=0.2.0`) instead of `latest`, then run the
update commands above.

## Reverse proxy

The container speaks plain HTTP; terminate TLS in the proxy and forward plain
HTTP. Allow request bodies of at least 10 MB (terminal sync uploads), e.g.
`client_max_body_size 10m;` in nginx.

## Image registry access

The image is `ghcr.io/sebbi08/pos`. Either make the GHCR package public once
(GitHub package settings, "Change visibility"), or log in on the server with a
token that has the `read:packages` scope:

```bash
docker login ghcr.io -u <github-user>
```

## Backup

```bash
docker compose exec postgres pg_dump -U pos pos > backup.sql
```
