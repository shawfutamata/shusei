#!/usr/bin/env bash
# Cloudflare側の置き場所を用意して、wrangler.jsonc に結線を書き込む。**はじめの1回だけ。**
#   bash scripts/setup-cloudflare.sh
#
# 秘密の値は画面にもコマンド履歴にも出さない。AUTH_CODE_PEPPER はこの場で
# 生成して、そのまま wrangler の標準入力へ渡す（人の目に触れない）。

set -uo pipefail
cd "$(dirname "$0")/.."

DB_NAME="tasuki"
BUCKET="tasuki-avatars"
W="npx --no-install wrangler"

say()  { printf '\n\033[1m%s\033[0m\n' "$1"; }
ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
info() { printf '  \033[33m…\033[0m %s\n' "$1"; }
die()  { printf '  \033[31m✗\033[0m %s\n' "$1"; exit 1; }

say "1. Cloudflareへのログイン"
if $W whoami 2>&1 | grep -q "not authenticated"; then
  info "ブラウザが開きます。ご自分で承認してください（この画面に貼るものはありません）"
  $W login || die "ログインできませんでした"
fi
account=$($W whoami 2>/dev/null | grep -oE '[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+' | head -1)
ok "ログインずみ${account:+（$account）}"

say "2. D1（会員・投稿・広告のデータ）"
if $W d1 info "$DB_NAME" >/dev/null 2>&1; then
  info "$DB_NAME はすでにあります。作り直しません"
else
  $W d1 create "$DB_NAME" >/dev/null 2>&1 || die "D1を作れませんでした"
  ok "$DB_NAME を作成"
fi
# IDは info から取る。create の出力形式に依存しないため。
uuid=$($W d1 info "$DB_NAME" --json 2>/dev/null \
  | grep -oE '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}' | head -1)
[ -n "$uuid" ] || die "database_id を読み取れませんでした。npx wrangler d1 info $DB_NAME で確認してください"
ok "database_id を取得"

say "3. R2（顔写真・広告画像）"
if $W r2 bucket info "$BUCKET" >/dev/null 2>&1; then
  info "$BUCKET はすでにあります"
else
  $W r2 bucket create "$BUCKET" >/dev/null 2>&1 || die "R2バケットを作れませんでした"
  ok "$BUCKET を作成"
fi

say "4. wrangler.jsonc に書き込む"
if grep -q "REPLACE_WITH_YOUR_D1_DATABASE_ID" wrangler.jsonc; then
  # macOSのsedでもGNU sedでも動くように、一時ファイル経由で置き換える。
  tmp=$(mktemp) && sed "s/REPLACE_WITH_YOUR_D1_DATABASE_ID/$uuid/" wrangler.jsonc > "$tmp" && mv "$tmp" wrangler.jsonc
  ok "database_id を書き込みました（IDは秘密ではないので、このままコミットして構いません）"
else
  info "すでに書き込みずみ"
fi

say "5. AUTH_CODE_PEPPER"
# セッションの合言葉。**あとから変えると全会員がログインし直しになる。**
if $W secret list 2>/dev/null | grep -q "AUTH_CODE_PEPPER"; then
  info "設定ずみ。作り直すと会員が全員ログアウトになるので、触りません"
else
  openssl rand -hex 32 | $W secret put AUTH_CODE_PEPPER >/dev/null 2>&1 \
    && ok "生成して設定しました（値は表示していません）" \
    || info "設定できませんでした。npx wrangler secret put AUTH_CODE_PEPPER で手動設定してください"
fi

say "ここまで完了。次にやること"
cat <<'NEXT'
  1. npm run deploy
       → 出てきた https://tasuki.<サブドメイン>.workers.dev が、いまの本番URL

  2. Google Cloud Console でOAuthクライアントを作り、リダイレクトURIに
     上のURL + /api/auth/google/callback を「完全一致」で登録する
       npx wrangler secret put GOOGLE_CLIENT_ID
       npx wrangler secret put GOOGLE_CLIENT_SECRET

  3. 自分を有効会員にする（メールアドレスはGoogleログインで使うもの）
       npx wrangler d1 execute tasuki --remote --command \
         "INSERT INTO members (id, email, display_name, membership_status, created_at)
          VALUES ('owner', 'あなたのメール', '二俣 将', 'active', datetime('now'))
          ON CONFLICT(id) DO UPDATE SET membership_status='active'"

  くわしくは docs/deploy-ja.md
NEXT
