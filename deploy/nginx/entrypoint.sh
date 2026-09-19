#!/bin/sh
# Chooses the nginx configuration that matches reality on this box.
#
# On a brand new server no certificate exists yet, and an nginx config naming
# ssl_certificate files that are absent refuses to start — which would stop the
# stack coming up at all, and certbot needs a running nginx to answer the ACME
# challenge. So: serve plain HTTP until a certificate is present, TLS after.
#
# Promotion to HTTPS therefore happens on restart, which is what
# `docker compose restart nginx` after the first issuance is for.
set -eu

DOMAIN=${DOMAIN:-tradeiqcse.tech}
LIVE="/etc/letsencrypt/live/$DOMAIN/fullchain.pem"

if [ -f "$LIVE" ]; then
  echo "entrypoint: certificate found for $DOMAIN, serving HTTPS"
  cp /etc/nginx/available/tls.conf /etc/nginx/conf.d/default.conf
else
  echo "entrypoint: no certificate for $DOMAIN yet, serving HTTP only"
  cp /etc/nginx/available/bootstrap.conf /etc/nginx/conf.d/default.conf
fi

# Certbot renews in its own container and cannot signal this one. Reloading on
# a timer is how the renewed certificate gets picked up; a reload is cheap and
# does not drop connections.
(
  while true; do
    sleep 6h
    nginx -t >/dev/null 2>&1 && nginx -s reload
  done
) &

exec nginx -g 'daemon off;'
