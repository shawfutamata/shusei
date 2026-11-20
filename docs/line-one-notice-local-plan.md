# 本人限定1通通知試験（未公開・未承認）

ローカル準備のみ。2026-11-20。実送信、本番設定、push、デプロイは行っていない。

## 公開・実施前に必要な承認

- 最新本番コードとの統合とこの差分の本番反映。
- 確認済み本人会員だけへ固定本文1通を送ること。旧試験枠は再開しない。
- 一般5フラグfalseのまま、以下3設定を本人ID・最大2時間の正確なUTC期間に限定して設定すること。
  - LINE_ONE_NOTICE_MEMBER_ID
  - LINE_ONE_NOTICE_STARTED_AT
  - LINE_ONE_NOTICE_EXPIRES_AT
- LINE APIへの送信受付と端末での実着信は別。実着信は本人に確認する。

## 入口と安全境界

`/settings/line/one-notice` と `/api/admin/line-one-notice`。既存getAppAccessの有効会員sessionと指定会員の完全一致。POSTはsame Origin、明示confirm、既知フィールドのみ。宛先・本文・会員・slotのクライアント指定は拒否。

期限はミリ秒付きUTC ISOのみ。最大2時間、開始前・期限以降は送信不可。画面を開いた期間文字列と送信時設定が一致しなければ拒否。一般5フラグはすべて文字列false必須。

固定案件 `tasuki-owner-one-notice-20261120-v1` は新しい `line_one_notice_budget` の1行のみ。INSERT OR IGNORE RETURNINGで1要求だけが枠を消費する。LINE認可検証、会員資格、同じ連携/認可revision、期限を送信直前に再確認する。宛先はDBの認証済みsubjectだけ。

枠はfetchより前にunknownへ消費し、200ならaccepted、4xxならfailed、5xx/redirect/timeout等はunknown。失敗・結果不明・再登録・会員削除・設定変更でも再送不可。トークン、本人ID、LINE ID、本文、外部応答本文は台帳に保存しない。旧 `line_test_budget` は触れない。

閉鎖操作は未送信でも固定枠を閉じる。閉鎖前にすでに開始した外部送信は取り消せない。最終チェックと外部送信はDBとの分散トランザクションではないため、送信開始直前/直後の閉鎖・期限到来と競合した要求を完全取消できるとは約束しない。

## 終了・ロールバック

3つの限定設定を外せば入口は閉じる。一般フラグ・完成済みLINE連携・旧試験枠は変更しない。台帳を削除して再開しない。コードを戻す場合も新規台帳は残す。

D1 Time Travel等の復元では台帳も過去に戻り得る。復元前に3設定を必ず外し、実施記録を照合し終わるまで再設定しない。R2バックアップはline_表を除外するため、台帳を復元できるとは保証しない。バックアップ復旧後は同じ試験を再開しない。

## 検証

- `node tests/line-one-notice-runtime.mjs`: 隔離Miniflare D1、12並列でも1要求、失敗/不明再送なし、close/認可変更競合、会員削除/再連携後の予算維持、本人session/Origin/入力制限、25設定/期間ケース。outboundServiceは全リクエストをfixtureで受け、実ネットワークは利用しない。
- `npm run typecheck`、変更ファイルへのeslint通過。
- 既存 `tests/line-test-runtime.mjs` と `tests/line-link-check-gates.mjs` を再実行。
- UIは親担当が静的SSR fixtureで360/390/430pxをCUA実描画し、横溢れなし・説明視認を確認。実認証・実送信のE2Eではない。
- 本番前には最新ブランチとの統合・全preflight・実経路の隔離統合試験を再実施すること。

- 親レビュー: 全体lint 0 errors/38 warnings、typecheck、build成功、git diff --check成功。2026-11-20。
