#!/bin/sh
# Seed an owner account on first boot via the SillyTavern API.
# Requires OWNER_HANDLE and OWNER_PASSWORD env vars.
# Runs once then touches a sentinel file to skip on subsequent boots.

set -e

SENTINEL="/usr/share/nginx/html/.owner-seeded"
ST_HOST="${ST_BACKEND:-http://sillytavern:8000}"

# Skip if already seeded or env vars not set
if [ -f "$SENTINEL" ] || [ -z "$OWNER_HANDLE" ] || [ -z "$OWNER_PASSWORD" ]; then
  exec "$@"
fi

echo "[seed-owner] Waiting for SillyTavern backend..."
for i in $(seq 1 30); do
  if wget -qO /dev/null "$ST_HOST/api/ping" 2>/dev/null; then
    break
  fi
  sleep 2
done

# Grab a CSRF token
CSRF=$(wget -qO- "$ST_HOST/csrf-token" 2>/dev/null | sed 's/.*"token":"\([^"]*\)".*/\1/')
if [ -z "$CSRF" ]; then
  echo "[seed-owner] Warning: could not get CSRF token, skipping seed"
  exec "$@"
fi

# Login as default-user (auto-created admin, no password)
LOGIN=$(wget -qO- --header="Content-Type: application/json" \
  --header="X-CSRF-Token: $CSRF" \
  --post-data='{"handle":"default-user","password":""}' \
  "$ST_HOST/api/users/login" 2>/dev/null) || true

if echo "$LOGIN" | grep -q '"handle"'; then
  # Fetch fresh CSRF after login (session cookie is in wget's cookie jar — use curl if available)
  # For simplicity, reuse the same token; SillyTavern usually accepts it within the same session window.

  OWNER_NAME="${OWNER_NAME:-$OWNER_HANDLE}"

  # Create the owner account
  CREATE=$(wget -qO- --header="Content-Type: application/json" \
    --header="X-CSRF-Token: $CSRF" \
    --header="Cookie: $(wget -qO /dev/null --save-cookies /dev/stderr "$ST_HOST/csrf-token" 2>&1 | grep -o 'session=[^;]*' || true)" \
    --post-data="{\"handle\":\"$OWNER_HANDLE\",\"name\":\"$OWNER_NAME\",\"password\":\"$OWNER_PASSWORD\",\"admin\":true,\"role\":\"owner\"}" \
    "$ST_HOST/api/users/create" 2>/dev/null) || true

  if echo "$CREATE" | grep -q '"handle"'; then
    echo "[seed-owner] Owner account '$OWNER_HANDLE' created successfully"
    touch "$SENTINEL"
  else
    echo "[seed-owner] Warning: could not create owner account: $CREATE"
  fi

  # Logout default-user
  wget -qO /dev/null --header="X-CSRF-Token: $CSRF" \
    --post-data='{}' "$ST_HOST/api/users/logout" 2>/dev/null || true
else
  echo "[seed-owner] Warning: could not login as default-user, skipping seed"
fi

exec "$@"
