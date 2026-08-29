#!/usr/bin/env bash
# 本番（Cloudflare Workers）へ送る前に、落ちないかを見る。読み取りだけで、何も変更しない。
#   bash scripts/preflight-deploy.sh
#
# ネットワークにも本番にも触らない。ここが赤いままSitesへ送らないこと。
# ビルドが通らないと wrangler deploy まで届かず、前の版が生きたままになる。
# 「出したのに変わらない」という気づきにくい状態を避けるため、先にここで見る。

set -uo pipefail
cd "$(dirname "$0")/.."

ok=0; ng=0
pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok+1)); }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; ng=$((ng+1)); }
warn() { printf '  \033[33m…\033[0m %s\n' "$1"; }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

section "1. あげようとしているコード"
branch=$(git rev-parse --abbrev-ref HEAD)
printf '  ブランチ  %s\n' "$branch"
printf '  先頭      %s\n' "$(git log --oneline -1)"
if [ -n "$(git status --porcelain)" ]; then
  warn "コミットしていない変更がある（送られるのはコミット済みのぶんだけ）"
  git status --short | sed 's/^/      /'
fi
# 秘密が紛れていないか。.dev.vars は絶対に送らない。
if git ls-files --error-unmatch .dev.vars >/dev/null 2>&1; then
  fail ".dev.vars がgitに入っている。取り消すこと"
else
  pass ".dev.vars はgitに入っていない"
fi

section "2. 検証"
[ -d node_modules ] || { echo "  依存を入れています…"; npm ci --silent --no-audit --no-fund; }
npm run --silent lint      >/dev/null 2>&1 && pass "lint"              || fail "lint"
npm run --silent typecheck >/dev/null 2>&1 && pass "typecheck"         || fail "typecheck"
npm run --silent build     >/dev/null 2>&1 && pass "本番ビルド"        || fail "本番ビルド"
npm run --silent check:perks  >/dev/null 2>&1 && pass "ランク特典がアプリと一致" || fail "ランク特典がアプリとずれている（npm run sync:perks）"
npm run --silent check:venues >/dev/null 2>&1 && pass "会場一覧がアプリと一致"   || fail "会場一覧がアプリとずれている（npm run sync:venues）"

section "3. 送り先"
if [ -f wrangler.jsonc ] && grep -q 'REPLACE_WITH_YOUR_D1_DATABASE_ID' wrangler.jsonc; then
  fail "wrangler.jsonc の database_id が未設定（npx wrangler d1 create tasuki）"
elif [ -f wrangler.jsonc ]; then
  pass "wrangler.jsonc の結線が埋まっている"
else
  fail "wrangler.jsonc が無い"
fi
if npx --no-install wrangler whoami 2>&1 | grep -q "not authenticated"; then
  warn "Cloudflareに未ログイン（npx wrangler login）"
else
  pass "Cloudflareにログインずみ"
fi

printf '\n\033[1m%d件OK / %d件NG\033[0m\n' "$ok" "$ng"
[ "$ng" -eq 0 ] || { printf '\033[31m直してから送ること。\033[0m\n'; exit 1; }
printf '本番へ: npm run deploy\n'
