#!/bin/bash
# Runs the ASGI app (as the unprivileged `brennkonto` user, listening on localhost only) and
# nginx (as root, since it needs to bind the privileged port 80) side by side in one container,
# and makes sure a SIGTERM from `docker stop` reaches both instead of just PID 1's direct child.
set -euo pipefail

su brennkonto -s /bin/bash -c "litestar --app app.main:app run --host 127.0.0.1 --port 8000" &
app_pid=$!

nginx -g 'daemon off;' &
nginx_pid=$!

cleanup() {
  kill -TERM "$app_pid" 2>/dev/null || true
  kill -TERM "$nginx_pid" 2>/dev/null || true
  wait "$app_pid" 2>/dev/null || true
  wait "$nginx_pid" 2>/dev/null || true
}
trap cleanup TERM INT

wait -n "$app_pid" "$nginx_pid"
cleanup
