# Deployment

One VM runs the whole stack, and the whole stack is one `docker compose up` —
database, Redis, both Nest services, the ML service, the frontend, nginx and
certbot. Nothing is hand-installed on the server except Docker itself.

- **Host**: EC2 `t3.small` (2 vCPU, 2 GiB + 2 GiB swap), Ubuntu 26.04, `ap-south-1`
- **Address**: Elastic IP, `tradeiqcse.tech` and `www` as A records. The apex
  is the only origin that serves the app; `www` answers with a 301 to it,
  because the bundle calls the API at the absolute apex origin and the
  services' CORS allowlists name only the apex.
- **Registry**: `ghcr.io/tradeiq-cse/tradeiq_cse/*`
- **Exposed to the internet**: nginx on 80 and 443, nothing else

Every other service is reachable only over the private Compose network. The
database, Redis and the internal ingestion route have no host port at all, so
they cannot be hit from outside even by misconfiguration.

## Why pull, not push

`.github/workflows/deploy.yml` publishes images and stops there. A systemd timer
on the VM fetches this repository and pulls the images every five minutes.

The server reaches out; CI never reaches in. Port 22 stays closed to everything
but a known address, there is no deploy key in GitHub secrets to leak, and a
compromised CI account cannot open a shell on the box. The cost is latency: a
merge to `dev` reaches the site within about five minutes rather than instantly.

## First deploy

Run on the server, as `ubuntu`.

### 1. Docker and swap

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu   # log out and back in for this to apply
```

A 2 GiB box needs swap, or the first data import gets OOM-killed:

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

nginx and certbot are **not** installed here — they are containers in the stack.

### 2. Check out the repository

```bash
sudo mkdir -p /opt/tradeiq && sudo chown ubuntu:ubuntu /opt/tradeiq
git clone --branch dev https://github.com/TradeIQ-CSE/tradeiq_cse.git /opt/tradeiq
cd /opt/tradeiq
```

### 3. Create the secrets

`.env.production` never enters git — this repository is public and every value
in it is a signing key, a database password or a bearer token.

```bash
cp .env.production.example .env.production
node -e "const{generateKeyPairSync}=require('crypto');const{privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});console.log('AUTH_JWT_PRIVATE_KEY='+Buffer.from(privateKey.export({type:'pkcs8',format:'pem'})).toString('base64'));console.log('AUTH_JWT_PUBLIC_KEYS='+Buffer.from(publicKey.export({type:'spki',format:'pem'})).toString('base64'))"
openssl rand -base64 32   # AUTH_EMAIL_ENCRYPTION_KEY
openssl rand -hex 32      # MARKET_INGESTION_TOKEN
openssl rand -hex 16      # once per database password
nano .env.production
```

`docker-compose.prod.yml` refuses to start with any of these unset, and both
Nest services refuse to boot under `NODE_ENV=production` with the development
keypair that ships in this repository. A missing secret is a failed start, not a
silently insecure one.

### 4. Bring the stack up

```bash
cd /opt/tradeiq
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
docker compose -f docker-compose.prod.yml --env-file .env.production ps
```

The site is now live over **plain HTTP**. nginx picks its configuration at
start-up based on whether a certificate exists; on a new box none does, so it
serves `bootstrap.conf`, which also answers the ACME challenge. A config naming
certificate files that do not exist would refuse to start, and certbot needs a
running nginx to validate against — hence the two-stage arrangement.

`docker/db/init.prod.sh` creates the per-service database users from
`.env.production` **on first boot only**, against an empty `db-data` volume.
Changing a password later does nothing until you `ALTER USER` by hand or destroy
the volume.

### 5. Issue the certificate

Confirm `dig +short tradeiqcse.tech` returns the Elastic IP first — certbot
validates over HTTP and fails if DNS has not caught up.

```bash
# --entrypoint certbot is required: the service's own entrypoint is the
# renewal loop, which would otherwise swallow these arguments and hang.
docker compose -f docker-compose.prod.yml --env-file .env.production \
  run --rm --entrypoint certbot certbot certonly --webroot -w /var/www/certbot \
  -d tradeiqcse.tech -d www.tradeiqcse.tech \
  --agree-tos -m <your-email> --no-eff-email

docker compose -f docker-compose.prod.yml --env-file .env.production restart nginx
```

The restart is what promotes the site to HTTPS: the entrypoint now finds the
certificate and loads `tls.conf` instead. Renewal runs by itself in the certbot
container, which checks twice a day; nginx reloads every six hours to pick up a
renewed certificate.

Let's Encrypt rate-limits failed attempts, so if DNS is not ready, wait rather
than retrying in a loop.

### 6. Enable automatic deploys

```bash
sudo cp deploy/systemd/tradeiq-deploy.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tradeiq-deploy.timer
systemctl list-timers tradeiq-deploy.timer
```

### 7. Load the price history

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  --profile seed run --rm -e CSE_DATASET_ARTIFACT=<release-url> market-data-seed
```

Then set `TRADEIQ_INGESTION_API_URL=https://tradeiqcse.tech/api/market` and
`TRADEIQ_INGESTION_TOKEN` (the `MARKET_INGESTION_TOKEN` value) in the
`cse-dataset` repository's secrets, so its daily cron delivers EOD prices here.

## Long-trade predictions (`ml-long-trade`)

A one-shot batch job, not a service. It trains the long-trade models for every
eligible stock, writes that day's predictions to the `ml` database and exits.
Why and how: [ADR 0011](../adr/0011-long-trade-batch-predictor.md) and
[`services/ml-prediction/README.md`](../../services/ml-prediction/README.md).

- **Image**: `ghcr.io/tradeiq-cse/tradeiq_cse/ml-long-trade:<branch|sha>`,
  published by `deploy.yml` like the others.
- **Compose service**: `ml-long-trade-job` in `docker-compose.prod.yml`, under
  the `jobs` profile. The deploy timer's `up -d --remove-orphans` never starts
  it, and its `pull` never updates it; the job's own unit pulls first.
- **Needs**: `ML_DB_PASSWORD` (already in `.env.production`) and a healthy
  `market-trading`. It reads prices only over the private network. All other
  variables are optional tuning (`ML_LONG_TRADE_*`; see the service README) and
  hold no secrets.

### Run it once by hand

```bash
cd /opt/tradeiq
C="docker compose -f docker-compose.prod.yml --env-file .env.production"
$C --profile jobs pull ml-long-trade-job
$C --profile jobs run --rm ml-long-trade-job
# a smoke run on two stocks:
$C --profile jobs run --rm -e ML_LONG_TRADE_SYMBOLS=COMB.N0000,JKH.N0000 ml-long-trade-job
echo "exit=$?"
```

Exit codes: `0` done (some models may have been skipped), `1` nothing could be
trained, `2` bad `ML_LONG_TRADE_*` configuration, `3` database or market-trading
unavailable. Anything non-zero makes the systemd unit fail.

### Schedule it (proposed, not yet installed)

`deploy/systemd/tradeiq-ml-long-trade.{service,timer}` run the job at **19:30
Asia/Colombo, Monday to Friday**. CSE closes at 14:30, and cse-dataset's EOD
cron starts at 14:45 and can take up to an hour. Please confirm the time before
enabling it. The deploy script does not install these units:

```bash
sudo cp deploy/systemd/tradeiq-ml-long-trade.* /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now tradeiq-ml-long-trade.timer
systemctl list-timers tradeiq-ml-long-trade.timer
sudo systemctl start tradeiq-ml-long-trade.service     # run now, through systemd
```

### Logs

The container is removed when it exits (`run --rm`), so `docker compose logs`
has nothing to show for a finished run. The log lives in journald:

```bash
journalctl -u tradeiq-ml-long-trade.service -f           # live
journalctl -u tradeiq-ml-long-trade.service --since today
```

Per run, look for:

- `Long-trade run <id> started: 27 configurations per stock` at the start.
- `Selected N of M securities (skipped: ...)`, which shows how big the run is.
- One `Trained long-trade model symbol=... config=... prob_long=... is_long_signal=...`
  line per model.
- `WARNING ... Skipping <symbol>` / `Skipped <symbol> <config>`. These are
  expected for thin or one-sided histories.
- `ERROR` lines. `market-trading unavailable` and `Database error` stop the run
  (exit 3). `Failed <symbol> <config>` with a traceback is a bug and should be
  reported, but it doesn't stop the run.
- The closing summary line,
  `Long-trade run <id> succeeded|partial|failed: stocks=... models_trained=...
  models_skipped=... models_failed=... elapsed=...s peak_rss_mb=...`.

### Runtime and memory

Measured locally (Docker, one core, 2,118 daily bars of COMB.N0000): about
**0.3 s per model, so 8 s per stock** for the 27 configurations, with a peak
RSS of **~215 MB**. The process holds one stock at a time, so memory does not
grow with the number of stocks. The compose service is capped at
`mem_limit: 768m`.

On the t3.small, expect a slower core, perhaps **15–20 s per stock**. With a few
hundred eligible securities, a full run should take **roughly 1–1.5 hours**.
The unit's `TimeoutStartSec=3h` is the backstop. Use the first real run's
`elapsed=` to replace this estimate. The job keeps one vCPU busy for its whole
run, which draws on the t3 CPU-credit balance (check `CPUCreditBalance` in
CloudWatch after the first week). To shorten it, narrow the universe
(`ML_LONG_TRADE_SYMBOLS`) or the grid (`ML_LONG_TRADE_GRID`).

### Check the results

```bash
$C exec db psql -U postgres -d ml -c "
  SELECT started_at, status, data_as_of, symbols_requested, models_trained,
         models_skipped, models_failed, completed_at - started_at AS took
  FROM ml.long_trade_runs ORDER BY started_at DESC LIMIT 5"

$C exec db psql -U postgres -d ml -c "
  SELECT symbol, config_key, prob_long, is_long_signal
  FROM ml.long_trade_predictions
  WHERE data_as_of = (SELECT max(data_as_of) FROM ml.long_trade_predictions)
  ORDER BY prob_long DESC LIMIT 20"
```

A run left at `status = 'running'` with no `completed_at` was killed (OOM, a
reboot, the timeout). The predictions it had already written are kept.
Re-running the same market day is safe: rows are upserted on
`(symbol, config_key, data_as_of)`, never duplicated.

## Everyday operations

All commands assume `cd /opt/tradeiq`. `C` below stands for
`docker compose -f docker-compose.prod.yml --env-file .env.production`.

| Task | Command |
|---|---|
| Deploy now, don't wait for the timer | `sudo systemctl start tradeiq-deploy.service` |
| Watch a deploy | `journalctl -u tradeiq-deploy.service -f` |
| Service logs | `C logs -f market-trading` |
| What's running | `C ps` |
| Memory pressure | `free -h` and `docker stats --no-stream` |
| Pause deploys | `sudo systemctl stop tradeiq-deploy.timer` |
| Long-trade job log | `journalctl -u tradeiq-ml-long-trade.service --since today` |
| Check TLS renewal | `C run --rm --entrypoint certbot certbot renew --dry-run` |

### Rolling back

Every published commit keeps its own image tag, so pin the SHA and deploy:

```bash
sed -i 's/^IMAGE_TAG=.*/IMAGE_TAG=<commit-sha>/' .env.production
sudo systemctl start tradeiq-deploy.service
```

Pin it in the file, not just on the command line — the next timer run reads
`.env.production` and would otherwise drag you back to the branch head. Set
`IMAGE_TAG=dev` again when the fix lands.

### Switching deploys from dev to main

1. Change the branch in `on.push.branches` in `.github/workflows/deploy.yml`.
2. On the server, set `IMAGE_TAG=main` in `.env.production` and
   `Environment=DEPLOY_BRANCH=main` in
   `/etc/systemd/system/tradeiq-deploy.service`, then `sudo systemctl daemon-reload`.

Images are tagged by branch, so both can exist in GHCR at once and the switch is
reversible.

## Things that will bite you

**The frontend image is tied to the domain.** Vite inlines
`VITE_MARKET_TRADING_API_URL` and `VITE_IDENTITY_AUTH_API_URL` when the image is
*built*, so they cannot be changed on the server. A different domain means
editing `PUBLIC_ORIGIN` in the workflow and rebuilding.

**Database passwords only apply on first boot.** See step 4.

**2 GiB is the real constraint.** Swap covers the import spikes, but if the box
starts thrashing, `docker stats` shows which service grew. Stopping the instance
and changing the type keeps the volume and the Elastic IP.

**Credits expire 1 December 2026.** After that this instance bills to a card at
roughly $0.021/hour. Either move it or budget for it.
