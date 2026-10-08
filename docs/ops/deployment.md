# Deployment

The EC2 host runs published container images. Application source code, package
installations and image builds stay in development and GitHub Actions.

- Host: EC2 `t3.small`, 2 vCPU and 2 GiB RAM, with 2 GiB swap.
- Public origin: `https://tradeiqcse.tech`; `www` redirects to the apex domain.
- Registry: `ghcr.io/tradeiq-cse/tradeiq_cse/*`.
- Public application ports: nginx on 80 and 443. Database and service ports stay
  within the Compose network.

## Server-owned configuration

`/opt/tradeiq` contains runtime configuration and operator helpers:

```text
compose.yaml                  Images, network, health checks and volume mounts
.env.production               Existing production secrets (mode 0600)
bin/deploy.sh                 Apply, verify and recover an image release
bin/release.py                Fetch and validate completed release metadata
bin/public-api-smoke.mjs      Check the public API through nginx
deploy/nginx/                 Server routing, domain, TLS and certificate startup
docker/db/init.prod.sh        Database users for an empty database volume
tradeiq-deploy.service        Deployment oneshot service
tradeiq-deploy.timer          Five-minute release check
.state/current-release        Selected release identifier
.state/releases/<id>/         Validated image settings and release records
```

These files are maintained on the server and in protected operator backups.
There is no Git checkout under `/opt/tradeiq`. The application repository keeps
local Compose and generic HTTP routing rules under `config/nginx` so their API
and cookie behaviour can be tested independently. Changes to those shared rules
need an explicit, validated server configuration update.

The runtime uses the existing external volumes `tradeiq-cse_db-data`,
`tradeiq-cse_letsencrypt` and `tradeiq-cse_certbot-webroot`. External volume names
must match the host; missing volumes fail validation instead of silently creating
an empty database or certificate store.

## Automatic deployment

GitHub Actions runs CI and builds the five application images plus the ML batch
image before publishing one completed release manifest. See [Image releases](releases.md).

The systemd timer reads completed release metadata and GHCR images. It neither
fetches source code nor builds images. Each update validates the manifest and
checksum, pulls every image by digest, tests the nginx candidate, runs the existing
ML schema migration, and updates the four application containers and nginx.
Health, running-image and public API checks gate the successful-release marker.
PostgreSQL, Redis and certbot remain running.

No new completed release means no application restart. A merge alone does not
prove successful image publication or deployment. The initial bootstrap selection
pins the images that were running before migration, until the first completed
release becomes available.

## Operational commands

Run as `ubuntu` from `/opt/tradeiq`:

```sh
cd /opt/tradeiq
current=$(cat .state/current-release)
compose() {
  docker compose --file compose.yaml --env-file .env.production \
    --env-file ".state/releases/$current/images.env" "$@"
}
compose ps
compose logs --tail 100 market-trading
bin/deploy.sh --check
```

| Task | Command |
| --- | --- |
| Check for a release now | `sudo systemctl start tradeiq-deploy.service` |
| Read deployment logs | `journalctl -u tradeiq-deploy.service -n 100 --no-pager` |
| Check timer | `systemctl list-timers tradeiq-deploy.timer` |
| Pause automatic checks | `sudo systemctl stop tradeiq-deploy.timer` |
| Restart automatic checks | `sudo systemctl start tradeiq-deploy.timer` |
| Check memory | `free -h` and `docker stats --no-stream` |
| Test certificate renewal | `compose run --rm --entrypoint certbot certbot renew --dry-run` |

### Select an earlier release

```sh
bin/deploy.sh --release release-dev-<full-commit-sha>
bin/deploy.sh --check
```

A successful manual selection pins automatic updates at that release. To resume
following completed releases:

```sh
bin/deploy.sh --resume
```

Failed health checks reapply the previous image selection. This does not reverse
database migrations. Schema changes must remain compatible with the previous
application version; a data restore is a separate operator procedure.

`bin/deploy.sh --apply-current` reapplies the current image settings and server
configuration without selecting a newer release. It also runs the health checks.

## Data, secrets and backups

The migration backup is at
`/var/backups/tradeiq/pre-image-runtime-20261007T231507Z`, with restricted access.
It contains the former checkout archive, exact environment file, database dumps,
roles, certificates, previous units and verification records. Database dumps were
checked with `pg_restore --list`; archive contents and checksums were verified
before the old checkout was removed. Keep this backup private because it contains
credentials and account data.

Preserve the existing JWT signing keys and `AUTH_EMAIL_ENCRYPTION_KEY`, as well as
all database passwords and ingestion credentials. An email-encryption key change
requires a separate data migration. Database initialization scripts run only for
an empty volume; editing environment passwords does not alter existing users.

Provisioning a replacement host requires the approved runtime configuration,
production environment and restored volumes from operator backups. Named external
volumes must exist before starting Compose. A source clone is not required.
Record and verify a fresh backup before any database or certificate changes.

Daily market delivery remains in the separate `cse-dataset` workflow using
`TRADEIQ_INGESTION_API_URL` and `TRADEIQ_INGESTION_TOKEN`. The optional seed importer
uses the image recorded in the same release and the `seed` profile. The ML batch
schedule is enabled separately through the server-owned configuration described below.

The frontend's API origin is compiled into its image. A domain change requires
updating `PUBLIC_ORIGIN` in the publishing workflow and rebuilding; changing a VM
environment value alone does not change the browser bundle.

## Scheduled ML training

The `ml-long-trade` image runs the model owner's batch command, writes results to
the ML database and exits. The health API remains a separate, lightweight image.
Normal application startup and deployment do not launch training.

During rollout, add the job configuration to the server-owned `compose.yaml` and
protected operator backups. Its `ml-long-trade-job` service must belong to the
`jobs` profile, use the existing Docker network, and receive only ML settings:
the database connection, internal market API URL and optional batch configuration.
Configure one CPU, a 768 MiB memory limit and no restart policy.

Before enabling the timer, complete the rollout checks in issue #190:

- Select a completed release containing `job_images.ml-long-trade`. Validate the
  selected manifest and checksum, and pull that image by its recorded digest.
- Apply the ML migrations using the selected API image. Preserve existing database
  data and credentials.
- Confirm the intended market-data delivery has completed. Agree the schedule and
  freshness policy with the ML owner; the proposed time is 19:30 Asia/Colombo on
  weekdays. A clock time alone does not establish that ingestion succeeded.
- Prevent overlapping jobs and application deployments, record the selected
  release in the job logs, and retain journald output after the container exits.
- Run one limited batch and inspect its exit code, saved run status and predictions,
  CPU/memory usage and application health before enabling daily execution.

The scheduler reads the batch image from the currently selected release and uses
`--no-deps` after checking service health. It does not start or replace application
containers. If a rollback selects a release without a batch image, training remains
disabled until an appropriate release is selected again.

Operator commands after the separately verified server update:

```sh
sudo systemctl start tradeiq-ml-long-trade.service
journalctl -u tradeiq-ml-long-trade.service -n 100 --no-pager
systemctl list-timers tradeiq-ml-long-trade.timer
sudo systemctl stop tradeiq-ml-long-trade.timer
```

The timer is not installed or enabled by this application PR. Merging publishes
the batch image for a later operator rollout; it preserves normal deployment.
