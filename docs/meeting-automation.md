# ひるのめぐろ例会アンケートの自動準備

管理画面 `/admin/meetings`。運営アカウントだけにダッシュボードの入口と設定を表示する。

- `tasuki-meeting-scheduler` が毎日16:00 UTC（日本時間翌日01:00）にホームページの公開開催日を確認。
- 開催2日前の01:00以降、開始時刻までに例会を一度だけ作成する。回答締切は開始11:30＋設定分数（初期値30分）。
- とみざわの簡単ログインURLは管理画面で登録。`MEETING_CONNECTION_KEY`（AES-GCM用32バイトのbase64）をアプリとスケジューラー両方のWorker Secretに同じ値で設定する。既存接続情報がある場合は鍵を勝手に更新しない。
- 接続先は `www.shuseiclub.jp/hirunomeguro/___STAFF___/` に限定。取得ごとに新規セッションを作成。ブラウザCookieを使用・保存しない。
- `list/set_info.php?id=...` から作成済み名簿の有無と最終テーブル数を確認。`list/list_download-MS.php?id=...&cd=U` のUTF-8・まちださがみ形式を取得する。
- 名簿取得後、自会場・他会場・その他の会員一覧を参照し、参加者と氏名・会社名が一致する会員の「会社PR」（事業概要）と業種を追加取得する。名簿の事業情報とPR原文を保持して重複を除き、登録画面の「事業概要・会社PR」に自動入力する。会社名が異なる場合や同名同社が複数ある場合は紐付けない。空欄から能力を推測しない。メール・電話・管理メモは取り込まない。
- 席割り作成、名簿ロック、メール送信は実行しない。未作成・接続失敗・100人を超える名簿などは準備待ちと理由を表示して、運営が再実行する。
- アンケートIDはランダムUUID。D1の例会ごとのロックと保存済みIDを使って、同時実行や途中失敗で重複を作らない。既に取り込んだ名簿・回答を置き換えない。
- 紹介用のプロフィールに席を保存しない。QRポスターだけにTABLE A〜Zを表示し、全テーブルで同じ公開アンケートURLを使用。
- `/admin/meetings/qr?id=...` がテーブル数分のA4印刷画面を生成する。「印刷 / PDFで保存」で保存できる。未取り込みの場合は配布前の注意を表示する。

## デプロイ・検証

```sh
npm run typecheck
node --experimental-strip-types --test tests/meeting-schedule.test.mjs
node tests/cron-runtime.mjs
npm run build
npx wrangler deploy --config dist/server/wrangler.json
npx wrangler deploy --config wrangler.meeting-scheduler.jsonc
```

cron-runtimeは一時D1＋モックした公開日程と名簿を使い、期限前に作成しないこと、接続未設定からの復旧、暗号化URL・リダイレクトのCookie、UTF-8インポート、テーブル数、席非表示、同時再実行で重複しないことを検証する。実データと認証情報をテストに保存しない。

実環境の取得検証には運営の接続登録と、とみざわ側で作成済みの名簿が必要。HTTPステータスやQR画面だけで名簿連携が完了したと判断しない。
