#!/usr/bin/env bash
# リリース準備の現状を判定する。読み取りだけで、何も変更しない。
#   bash scripts/check-release-readiness.sh
# 秘密情報は表示しない。設定済みかどうかだけを出す。

set -uo pipefail
cd "$(dirname "$0")/.."

API="${EXPO_PUBLIC_API_BASE_URL:-https://give-hub-shusei.shaw-futamata.chatgpt.site}"
ok=0; ng=0; todo=0

pass() { printf '  \033[32m✓\033[0m %s\n' "$1"; ok=$((ok+1)); }
fail() { printf '  \033[31m✗\033[0m %s\n' "$1"; ng=$((ng+1)); }
todo() { printf '  \033[33m…\033[0m %s\n' "$1"; todo=$((todo+1)); }
section() { printf '\n\033[1m%s\033[0m\n' "$1"; }

section "1. 手元のツール"
for tool in node npm; do
  if command -v "$tool" >/dev/null 2>&1; then pass "$tool $("$tool" -v)"; else fail "$tool が無い"; fi
done
if command -v npx >/dev/null 2>&1 && npx --no-install eas-cli --version >/dev/null 2>&1; then
  pass "eas-cli $(npx --no-install eas-cli --version 2>/dev/null)"
else
  todo "eas-cli 未導入（初回は npx eas-cli が自動で取得する）"
fi

section "2. コードの検証"
[ -d node_modules ] || { echo "  依存を入れています…"; npm ci --silent --no-audit --no-fund; }
npm run --silent lint      >/dev/null 2>&1 && pass "web lint"      || fail "web lint"
npm run --silent typecheck >/dev/null 2>&1 && pass "web typecheck" || fail "web typecheck"
npm run --silent build     >/dev/null 2>&1 && pass "web build"     || fail "web build"
[ -d mobile/node_modules ] || { echo "  mobile の依存を入れています…"; (cd mobile && npm ci --silent --no-audit --no-fund); }
(cd mobile && npx tsc --noEmit) >/dev/null 2>&1 && pass "mobile typecheck" || fail "mobile typecheck"

section "3. 本番APIの境界 ($API)"
status() { curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$@"; }

# サイト全体が所有者限定公開だと何もかも401になり、アプリ側のゲートを見たことにならない。
privacy=$(status "$API/privacy")
support=$(status "$API/support")

if [ "$privacy" = "200" ]; then pass "/privacy が公開で開ける（審査担当者が見られる）"
else todo "/privacy が $privacy"; fi
if [ "$support" = "200" ]; then pass "/support が公開で開ける（審査担当者が見られる）"
else todo "/support が $support"; fi

if [ "$privacy" != "200" ]; then
  todo "サイトが所有者限定公開のため、APIの権限境界はここからは判定できない"
  todo "Sitesを公開アクセスへ変更してから、このスクリプトを再実行する"
else
  code=$(status "$API/api/board")
  case "$code" in
    401|403) pass "未認証の /api/board が $code" ;;
    200)     fail "未認証で /api/board が 200。誰でも掲示板が読める状態" ;;
    *)       todo "/api/board が $code（想定外。手で確認する）" ;;
  esac

  code=$(status -X POST -H 'content-type: application/json' \
    -d '{"email":"no-such-member@example.invalid"}' "$API/api/mobile/auth/request-code")
  case "$code" in
    400) pass "未登録メールの認証コード要求が 400" ;;
    200) fail "未登録メールに認証コードが通っている" ;;
    *)   todo "request-code が $code（想定外。手で確認する）" ;;
  esac
fi

section "4. アプリ設定"
grep -q 'privacyManifests' mobile/app.config.ts && pass "iOS privacy manifest 宣言あり" || fail "iOS privacy manifest が無い"
grep -q '"ios"'     mobile/eas.json && pass "eas submit の iOS プロファイル"     || fail "eas submit の iOS プロファイルが空"
grep -q '"android"' mobile/eas.json && pass "eas submit の Android プロファイル" || fail "eas submit の Android プロファイルが空"

section "5. 提出用の環境変数（値は表示しない）"
for name in APPLE_ID ASC_APP_ID APPLE_TEAM_ID GOOGLE_SERVICE_ACCOUNT_KEY_PATH; do
  if [ -n "$(printenv "$name" 2>/dev/null)" ]; then pass "$name 設定済み"; else todo "$name 未設定（eas submit の直前に export する）"; fi
done

section "6. ここから先は人の手でしかできない"
cat <<'MANUAL'
  - Apple Developer Program の登録と本人確認
  - Google Play Console の開発者アカウント登録（法人か個人かで公開時期が変わる）
  - Resend のAPIキー発行と送信元ドメイン認証
  - Sites の秘密環境変数の設定と、公開アクセスへの切り替え
  - 実機でのログイン・カメラ・OCR・通知の確認とスクリーンショット撮影
  - 両ストアのコンソールでのアプリ作成と申請
  手順は docs/release-runbook-ja.md
MANUAL

printf '\n\033[1m結果\033[0m  通過 %d / 未達 %d / 未着手 %d\n' "$ok" "$ng" "$todo"
[ "$ng" -eq 0 ]
