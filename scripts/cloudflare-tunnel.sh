#!/usr/bin/env bash
# Sobe o app (Vite), o proxy de escritas e o tunnel da Cloudflare, para abrir o
# app de fora da máquina em https://$PUBLIC_HOST. Com --noproxy, a API do proxy
# não sobe. O tunnel só precisa levar esse endereço ao Vite (localhost:5173), que
# repassa os POST (/rest/) ao proxy (vite.config.mts). Ver proxy/README.md.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ROOT_DIR}/.env.local"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

TUNNEL_NAME="${TUNNEL_NAME:-}"
PUBLIC_HOST="${PUBLIC_HOST:-}"
# As portas fixas do app (vite.config.mts) e do proxy (wrangler dev).
APP_SERVICE="http://localhost:5173"
PROXY_SERVICE="http://localhost:8787"

fail() {
  echo "$@" >&2
  exit 1
}

START_PROXY=1
for arg in "$@"; do
  case "$arg" in
    --noproxy) START_PROXY=0 ;;
    *) fail "Opção desconhecida: $arg" ;;
  esac
done

[[ -n "$TUNNEL_NAME" ]] || fail "TUNNEL_NAME não definido. Configure em .env.local (ver .env.example)."
[[ -n "$PUBLIC_HOST" ]] || fail "PUBLIC_HOST não definido. Configure em .env.local (ver .env.example)."
command -v cloudflared >/dev/null 2>&1 || fail "cloudflared não encontrado. Instale com: brew install cloudflared"
if [[ "$START_PROXY" -eq 1 ]]; then
  # O Wrangler (proxy) exige Node 22 ou mais novo.
  (($(node -p 'process.versions.node.split(".")[0]') >= 22)) ||
    fail "O proxy (Wrangler) exige Node 22 ou mais novo; este shell usa o $(node -v). Rode 'nvm use' (versão em .nvmrc)."
fi

if command -v dig >/dev/null 2>&1 && [[ -z "$(dig +short "$PUBLIC_HOST")" ]]; then
  echo "Aviso: $PUBLIC_HOST ainda não tem DNS. Crie com:"
  echo "  cloudflared tunnel route dns $TUNNEL_NAME $PUBLIC_HOST"
  echo "(se o cloudflared responder 'unauthorized', rode antes: cloudflared tunnel login)"
  echo
fi

services=("$APP_SERVICE")
if [[ "$START_PROXY" -eq 1 ]]; then
  services+=("$PROXY_SERVICE")
fi

for service in "${services[@]}"; do
  port="${service##*:}"
  if lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
    if [[ "$START_PROXY" -eq 1 ]]; then
      fail "A porta $port já está em uso (um 'bun run dev' aberto?). Encerre-o: o tunnel sobe o app e o proxy."
    fi
    fail "A porta $port já está em uso (um 'bun run dev' aberto?). Encerre-o: o tunnel sobe o app."
  fi
done

PUBLIC_URL="https://$PUBLIC_HOST"

# Vite: aceita o Host público e repassa /rest/ ao proxy (vite.config.mts); o app manda os POST ao endereço público.
export PUBLIC_HOST
if [[ "$START_PROXY" -eq 1 ]]; then
  LOCAL_ORIGINS="$(sed -n 's/^ALLOWED_ORIGINS *= *"\(.*\)"/\1/p' "$ROOT_DIR/proxy/wrangler.toml")"
  export VITE_JIRA_WRITE_PROXY_URL="$PUBLIC_URL"
  # Proxy: aceita também a origem pública (dev:proxy no package.json).
  export PROXY_ALLOWED_ORIGINS="$LOCAL_ORIGINS,$PUBLIC_URL"
else
  unset VITE_JIRA_WRITE_PROXY_URL
fi

echo "Iniciando tunnel '$TUNNEL_NAME'"
echo "  público → $PUBLIC_URL"
echo "  app     → $APP_SERVICE"
if [[ "$START_PROXY" -eq 1 ]]; then
  echo "  proxy   → $PROXY_SERVICE ($PUBLIC_URL/rest/..., pelo Vite)"
else
  echo "  proxy   → desligado (--noproxy)"
fi
echo

cd "$ROOT_DIR"
if [[ "$START_PROXY" -eq 1 ]]; then
  exec bun run --parallel dev:app dev:proxy "cloudflared tunnel run $TUNNEL_NAME"
fi
exec bun run --parallel dev:app "cloudflared tunnel run $TUNNEL_NAME"
