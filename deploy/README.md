# Server deployment

Runs the POS server (API + admin frontend) and Postgres with Docker Compose.

## First setup

```bash
cd deploy
cp .env.example .env     # set ADMIN_PIN, POSTGRES_PASSWORD and POS_TAG
docker compose up -d
```

- `ADMIN_PIN` must be **4 to 6 digits** and must not be `0000`. The server
  refuses to start otherwise (the admin keypad takes at most 6 digits).
- `POSTGRES_PASSWORD` is put into the database URL as is, so use a value
  without special characters, e.g. from `openssl rand -hex 24`. It is only
  applied when the database volume is created: changing it later does not
  change the password of an existing volume.

The server is then reachable on `POS_BIND:POS_PORT` (default
`127.0.0.1:3001`). Postgres is not published to the host.

## Network exposure

By default the app port is bound to `127.0.0.1`, so only a reverse proxy on
the same machine can reach it. Set `POS_BIND=0.0.0.0` only when the proxy runs
on another machine, and then restrict access to the proxy's address with a
firewall rule in the `DOCKER-USER` iptables chain — ports published by Docker
bypass ufw and the plain `INPUT` chain.

## Reverse proxy

The container speaks plain HTTP; terminate TLS in the proxy and forward plain
HTTP. Allow request bodies of at least 10 MB (terminal sync uploads), e.g.
`client_max_body_size 10m;` in nginx.

The server trusts exactly one proxy hop and takes the client address from
`X-Forwarded-For`, so the proxy must set it (nginx:
`proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;`). Without it all
clients share the proxy's address for the login lockout below.

## Admin login lockout

After 5 wrong admin PINs from one IP address (admin login and admin API calls
count together), that address is locked out for 5 minutes (HTTP 429). A correct
PIN resets the counter. Restarting the server clears all locks.

## Releases and updates

A release is started by pushing a version tag (`npm run release`). The server
image `ghcr.io/sebbi08/pos:X.Y.Z` exists only after the tag's release workflow
run has finished — wait for it before updating.

Pin the version in `.env` instead of using `latest`, so that an unrelated
`docker compose pull` cannot move the server to a new version:

```bash
POS_TAG=0.2.0     # bump this for every release
```

Update order for a release:

1. Wait for the tag's release run to finish.
2. Bump `POS_TAG` in `.env`, then promptly run

   ```bash
   docker compose pull && docker compose up -d
   ```

3. Terminals download the new version and install it when the app is quit.

Sync between a terminal and the server is refused (HTTP 409 "Versionen passen
nicht zusammen") until both run the same version, so update the server right
after the release run and restart the terminals.

## Image registry access

The image is `ghcr.io/sebbi08/pos`. Either make the GHCR package public once
(GitHub package settings, "Change visibility"), or log in on the server with a
token that has the `read:packages` scope:

```bash
docker login ghcr.io -u <github-user>
```

## Backup and restore

Backup (`-T` disables the pseudo-TTY, which would otherwise corrupt the dump):

```bash
docker compose exec -T postgres pg_dump -U pos pos > backup.sql
```

Restore into a fresh, empty database volume (e.g. on a new machine, or after
`docker compose down -v`):

```bash
docker compose up -d postgres
docker compose exec -T postgres psql -U pos pos < backup.sql
docker compose up -d
```
