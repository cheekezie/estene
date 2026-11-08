# Deploying the API to a DigitalOcean droplet

Each push to `main`/`master` that changes the API, contracts, config, the lockfile or these files
runs `.github/workflows/deploy-api.yml`. The workflow does three things:

1. Runs the API and contracts typecheck and tests. If anything fails, nothing deploys.
2. Builds `apps/api/Dockerfile` and pushes the image to `ghcr.io/<owner>/estene-api:<commit>`.
3. Copies this folder's files to `/opt/estene` on the droplet and runs `deploy.sh`. That pulls the
   image, restarts the API and waits for `/health`.

The droplet never builds anything and never holds the source code. You can also deploy by hand
from the Actions tab with **Run workflow**.

## One-time setup

**1. Droplet.** Use Ubuntu 24.04 with at least 2 GB of RAM (MongoDB needs it).

```sh
# as root on the droplet
curl -fsSL https://get.docker.com | sh
adduser --disabled-password --gecos "" deploy && usermod -aG docker deploy
mkdir -p /opt/estene/backups && chown -R deploy:deploy /opt/estene
ufw allow OpenSSH && ufw allow 80 && ufw allow 443 && ufw --force enable
```

**2. DNS.** Point an `A` record for `api.estene.ng` at the droplet's IP. Caddy gets the HTTPS
certificate the first time it starts.

**3. Deploy key.** On your laptop:

```sh
ssh-keygen -t ed25519 -f estene_deploy -N ""
ssh-copy-id -i estene_deploy.pub deploy@<droplet-ip>
```

**4. GitHub secrets.** Add these under Settings → Secrets and variables → Actions:

| Secret            | Value                                           |
| ----------------- | ----------------------------------------------- |
| `DROPLET_HOST`    | the droplet's IP                                |
| `DROPLET_USER`    | `deploy`                                        |
| `DROPLET_SSH_KEY` | the contents of the private key `estene_deploy` |

**5. Registry login.** The image is private, so the droplet signs in to GitHub's registry once.
Create a classic personal access token with only the `read:packages` scope, then run this as
`deploy`:

```sh
echo <token> | docker login ghcr.io -u <github-username> --password-stdin
```

**6. Settings.** As `deploy`, create `/opt/estene/.env`:

```sh
API_DOMAIN=api.estene.ng
```

Then create `/opt/estene/api.env` with the API's secrets. Use `apps/api/.env.example` as the
list, but leave out `MONGODB_URI`, `REDIS_URL`, `PORT` and `NODE_ENV`, which compose sets. The
minimum:

```sh
JWT_SECRET=<openssl rand -hex 32>
ENCRYPTION_KEY=<openssl rand -hex 32>
CORS_ORIGINS=https://admin.estene.ng,https://portal.estene.ng,https://estene.ng
PUBLIC_SITE_URL=https://estene.ng
API_PUBLIC_URL=https://api.estene.ng
PAYMENTS_PROVIDER=saukipay
SAUKIPAY_SECRET_KEY=...
TERMII_API_KEY=...
```

Run `chmod 600 /opt/estene/api.env`.

**7. First deploy.** Push to `main`, or use **Run workflow**. Then create the first admin. It
prints a temporary password once.

```sh
cd /opt/estene
docker compose exec api node dist/create-admin.js --email you@estene.ng --name "Your Name"
```

**8. SaukiPay.**

- Whitelist the droplet's IP.
- Set the webhook URL to `https://api.estene.ng/api/public/payments/webhooks/saukipay`.

## Day to day

```sh
cd /opt/estene
docker compose ps                       # what's running
docker compose logs -f api              # API logs
./deploy.sh ghcr.io/<owner>/estene-api <older-commit-sha>   # roll back
```

After changing `api.env`, apply it with `docker compose up -d api`.

## Backups

MongoDB keeps its data in a Docker volume on this droplet only. Add a nightly dump with
`crontab -e` as `deploy`:

```cron
30 2 * * * cd /opt/estene && docker compose exec -T mongo mongodump --archive=/backups/estene-$(date +\%F).gz --gzip && find backups -name '*.gz' -mtime +14 -delete
```

Then copy `/opt/estene/backups` off the droplet regularly, for example to DigitalOcean Spaces with
`s3cmd`. Turn on droplet backups in the DigitalOcean panel as well.
