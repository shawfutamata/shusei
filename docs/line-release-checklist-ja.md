# LINE連携の公開前チェックリスト

この文書は公開作業の準備用。承認済みの運営方針、設定済みの秘密値、実環境の合格を証明するものではない。実LINE・メール送信や本番変更は、この文書の作成では行っていない。

## 先に分けて考えること

1. **コード配置**と**利用開始**は別。機能フラグをOFFにしたコード配置でも本番変更なので、正規の公開許可が必要。
2. **無料期間延長**はLINEと独立して公開できる。2027年2月28日23:59:59.999 JSTまで。Stripe契約や請求は変更しない。独立差分の元commitはaddf381。
3. **LINEログイン**、**新規登録**、**通知**を別々に検証し、合格したものだけ有効化する。
4. 自動退会は共有・請求・画像・バックアップの未解決点があるためOFFを維持する。単にOFFにしただけで、退会受付の代わりにはならない。

## 既に決まっている実装

- LINEから取得するのはopenidの識別子と認証トークン。LINEの氏名・画像・メールは要求しない。
- 新規登録はTASUKIへの氏名・メール入力、同意、メール確認コード、LINE本人確認の順。既存会員との自動統合はしない。
- 友だち状態APIは呼ばない。通知は種類別の明示同意、友だち追加案内、unfollowによる停止を使う。API受付と端末への配達は区別する。
- メール取得権限申請と、その申請用スクリーンショットは不要。
- 解除はメール本人確認の後に公式deauthorizeを行い、204を確認してからLINE連携情報を消す。途中の取消は送信済みのLINE側処理を取り消せない。

## 運営が確定する最小の事項

未確定のまま公開ポリシーへ断言したり、法令遵守を申請したりしない。

| 項目 | 実装・資料から分かっていること | 推奨する進め方と未決定部分 |
|---|---|---|
| 連携中の保存 | LINE識別子・暗号化tokenを24時間超保存。解除成功時に現用DBから削除。期限切れtokenは停止し、解除するまでは連携情報を保持 | 既存草案のこの説明を運営確認。保存を終了する追加条件が必要なら仕様を決めてから実装 |
| 一時情報 | 登録draft20分、コード/解除grant10分。期限後は無効、清掃は定期処理等で実施 | 5分ごとの清掃を配置し成功監視。期限と物理削除時刻を同一と約束しない |
| バックアップ | 新しいR2 dumpからline_表を除外。本人入力情報は通常の控えに含まれる。R2の通常清掃コードは日次30日＋月初約1年。D1 Time Travel、既存/手元の控えは別 | 実際の保持設定・過去の控えを確認。復元時はLINEと通知を停止し、解除/退会の記録を照合してから復旧する責任者・手順を決める。復元用の再削除台帳は未実装 |
| LINE本人確認ができない場合 | メール確認後に同じLINEの再認証へ進める。元のLINEが使えないと自動処理だけでは公式解除完了を確認できない | 受信できる窓口と対応者を確定。手動判断中に勝手に本人情報を上書きしたり、完了と案内したりしない |
| 退会・共有情報 | 自動退会はOFF。共有DM/紹介特典/請求/例会等を勝手に消さない | 受付方法と、何を消し何を残すかを決定。単に「アプリからすべて消せる」と案内しない。LINE開始前に実行できる受付・処理経路を用意 |
| 通知テスト | 実受信・通数は未確認。有料プランへ変更していない | 受信先本人・試す件数・無料枠内かを確認。限定テストから開始し、プラン変更や課金上限を勝手に選ばない |

2026年11月11日の本人指定に合わせ、未公開コードの問い合わせ先をs_futamata@colourjam-inc.comへ統一した（app/company.ts）。既存の公開版にあるinfo@tasuki.clubを変更したことにはならない。LINEチャネルの管理連絡先も指定のアドレスを使用する。実配送と削除・復旧受付の運用確認は別途必要。

プライバシー追記草案は `docs/line-integration-ja.md`。既存 `/privacy` と `/support` の自動退会の説明も実際の受付方法と合わせる必要がある。問い合わせ先の指定だけを未公開コードに反映し、保存・削除の本文は変更していない。

## 管理画面で確認する対象

管理画面へのログイン状態を確認してから、必要な画面だけ本人のログインを依頼する。パスワード・秘密値を会話へ貼ってもらわない。以下のLINE設定は2026年11月12日に再確認済み。Bot user IDは未確認。

- LINE Developers：Provider「ColourJam」2005057441。
- LINE Login：2012557414。開発中のまま。公式アカウントとリンク、callback `https://tasuki.club/api/auth/line/callback`。
- Messaging API：2012557366。公式アカウント「TASUKI」@771inxtc。webhook `https://tasuki.club/api/line/webhook`、OFF。
- Cloudflare：Account `06113a41b9a334699aeef23f430117cb` の本体Worker `tasuki`。検証済み管理URLは https://dash.cloudflare.com/06113a41b9a334699aeef23f430117cb/workers/services/view/tasuki/production 。D1名は `tasuki`。定期Worker `tasuki-line-notifications` は未作成。
- Resend：TASUKIの確認コード送信元ドメイン・実配送。LINE登録を有効にする前に確認する。

今回、本人Macの既存セッションから本体設定を読み取り、配信100%の版が `db7ed797`（コード `eaf791e`、Build ready）であることを確認した。Runtime variables & secretsは11項目で、`LINE_` 項目はゼロ。既存の `AUTH_CODE_PEPPER` / `AUTH_FROM_EMAIL` / `RESEND_API_KEY` とGoogle/Stripe等の設定は存在するが、秘密値は表示・コピーせず、実配送・有効性まで確認したものではない。設定変更・token発行・配信は行っていない。

### 秘密を表示せず確認する設定

| 対象 | 設定名 | 確認内容 |
|---|---|---|
| Login | LINE_LOGIN_CHANNEL_ID、LINE_PROVIDER_ID | 上記Login/Providerと一致 |
| Login | LINE_LOGIN_CHANNEL_SECRET | 正しいLoginチャネルのsecretを安全な設定経路で保存 |
| 暗号化 | LINE_TOKEN_ENCRYPTION_KEY、LINE_TOKEN_KEY_VERSION | 32byte canonical base64の鍵と鍵版。既存鍵があれば無断で交換しない |
| 解除 | 追加の固定tokenは不要 | Login ID/secretから解除直前に15分のstateless channel tokenを取得する。永続保存しない。Messaging tokenや通常のshort-lived tokenで代用しない |
| 登録メール | RESEND_API_KEY、AUTH_FROM_EMAIL、AUTH_CODE_PEPPER | 既存設定を壊さず存在・送信元・実配送を確認。値をログへ出さない |
| 通知 | LINE_MESSAGING_PROVIDER_ID | Loginと同一Provider |
| 通知 | LINE_MESSAGING_CHANNEL_TOKEN、LINE_MESSAGING_CHANNEL_SECRET | Messagingチャネル専用。秘密をコード・会話へ出さない |
| 通知 | LINE_BOT_USER_ID、LINE_OFFICIAL_ACCOUNT_ID | BotはUから始まるID。チャネル番号と取り違えない。公式IDは@771inxtc |
| 定期清掃/再送 | LINE_NOTIFY_CRON_TOKEN | 32文字以上の専用secretを本体・定期Workerへ同じ値で設定 |

解除用の一時tokenは `POST https://api.line.me/oauth2/v3/token` で必要時だけ取得する。発行前と発行後に、同じ連携・credential・lease・未失効の本人確認を照合し、途中取消や期限切れなら解除要求を送らない。一時tokenは15分で失効し、個別revokeはできない。実発行は未実施。公式仕様: https://developers.line.biz/en/reference/line-login/#deauthorize-your-app-to-which-the-user-has-granted-permissions 、https://developers.line.biz/en/reference/messaging-api/nojs/#issue-stateless-channel-access-token 。

### 初期フラグと段階的な確認

| フラグ | コード配置時 | 有効化の条件 |
|---|---|---|
| LINE_DATA_POLICY_READY | false/未設定 | 保存・削除・窓口・復旧手順を決定し、承認済み公開ポリシーと実装が一致 |
| LINE_LOGIN_ENABLED | false/未設定 | 許可テスターの連携/ログイン/取消/解除/再認証と既存会員保護を確認 |
| LINE_SIGNUP_ENABLED | false/未設定 | 上記に加え本人入力メールの配送・OTP・新規登録を確認 |
| LINE_NOTIFICATIONS_ENABLED | false/未設定 | 上記に加え受信同意・友だち追加・届かない条件・停止・重複抑止・通数を確認 |
| ACCOUNT_ERASURE_ENABLED | false/未設定 | 今回は有効化しない |

開発中のLINE Loginチャネルでは許可したテスターで確認する。テスト用設定で機能をONにすることも設定変更なので、対象・許可・影響範囲を確かめてから行う。一般利用者へ開放するためだけにLoginチャネルを先に公開しない。

解除用の構成が揃っていれば、通常ログインや通知のフラグをOFFにしても既存利用者の解除専用再認証経路は残る。障害時に暗号鍵やLoginのID/secretまで消すと、解除を妨げるため行わない。

## 実環境テスト記録の項目

- 実行日時、配置commit/設定版、テスター、許可された通知先・件数。秘密値・token・確認コードは記録しない。
- Google既存ログイン維持、同じ会員ID・投稿・契約の保持、既存メールからの重複登録拒否。
- 新規登録：入力/同意OFF/OTP誤り/期限/再送/連打/途中取消/完了。
- LINE側の取消：次回利用・送信を停止し、会員本体やGoogleセッションを勝手に消さない。
- 解除：204のみ完了、pending/retry/同じLINE再認証、別LINE拒否、取消と遅延応答。
- 通知：同意前送信なし、明示同意後の限定受信、停止/ブロック後の送信停止、ブロック解除だけで再開しない、同じイベントの重複送信なし。
- 清掃：定期Workerが成功し、期限切れdraft/code/grantが消える。通知OFFでも清掃が動く。
- 失敗時：用途別フラグをOFF。DB/秘密を削除して戻したことにしない。通信結果が不明な送信や解除は、無条件に繰り返さない。

## 検証の区別と禁止事項

- `tests/line-feature-gates.mjs` は偽設定だけで未設定/誤設定/段階的OFF/解除経路維持を確認する。本番のSecretsの存在や有効性を証明しない。
- ローカルDOM/React状態テストは、実ブラウザの見た目や実LINE往復の合格ではない。
- Macの隔離localhost閲覧は以前にorigin承認で拒否された。新しい適切な承認なしの再試行や別経路への迂回はしない。
- 本番ブランチへのpushはCloudflare自動公開と同義。過去に拒否された公開操作を別のツールへ置き換えて通さない。
- D1本番のデータ変更、LINEチャネル公開、webhook有効化、実通知、秘密値追加、ポリシー公開は未実施。実行済みでない欄を完了にしない。
