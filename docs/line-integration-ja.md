# LINE連携・LINEログイン

## 現在の状態

2026年11月12日、本人による公開commit `a531fdb` とCloudflare本番version `8241e958`（100%）を確認。無料期間延長とLINEコードは配置済みだが、LINE関連4フラグと自動退会はすべてfalse。必要なLINE秘密5項目は暗号化保存済み。実LINE認証・実通知/メール・審査申請は未実施で、実環境E2E合格ではない。`/privacy` の問い合わせ先は本人指定に更新済みだが、LINE保存/削除方針の追記草案は未承認・未公開。

承認された登録方式は、**LINEから氏名・メールを取得せず、TASUKIで本人が入力し、メール確認コードの認証後にLINE本人確認を行う方式**。通常の登録・ログイン・連携・解除用の認証scopeは `openid` のみ。LINEのメール取得権限申請は不要。

機能は `LINE_DATA_POLICY_READY` と用途別の `LINE_LOGIN_ENABLED` / `LINE_SIGNUP_ENABLED` / `LINE_NOTIFICATIONS_ENABLED` が未設定またはfalseなら無効。必要な暗号鍵・LoginチャネルID/secretが欠けてもログイン・登録は無効。秘密値を追加しただけでは有効にならない。オンライン退会は別の `ACCOUNT_ERASURE_ENABLED` で停止している。

**通知方式は友だち状態を照会しない方式に確定。** 通常ログインと通知設定の両方でopenidだけを要求し、friendship/profile APIを呼ばない。友だち追加を案内し、同じLINEで本人確認した通知同意を記録する。LINEの配達条件を満たさない場合には、保存・API受付が成功しても通知が届かないことを表示する。本体の安全な設定準備は済んだが、実配信はまだ行っていない。

## LINE管理画面の準備記録

2026年11月11〜12日に管理画面で確認された非秘密値。下記IDとOFFフラグは本体Cloudflareにも設定済み。

| 項目 | 値・状態 |
|---|---|
| 公式アカウント | TASUKI、@771inxtc |
| Provider | ColourJam、2005057441 |
| Messaging APIチャネルID | 2012557366 |
| LINE LoginチャネルID | 2012557414 |
| Loginと公式アカウントのリンク | 保存済み |
| callback | https://tasuki.club/api/auth/line/callback 保存済み |
| Webhook URL | https://tasuki.club/api/line/webhook 保存済み |
| 連絡先 | s_futamata@colourjam-inc.com |
| LINE Login | 開発中、一般公開していない |
| Webhook | OFF、実エンドポイント検証前 |
| Messaging API token | 初回発行し、本体WorkerのSecretへ暗号化保存済み。値は記録しない |
| メール取得権限 | 未申請。新方式では申請不要 |

非秘密設定は `LINE_OFFICIAL_ACCOUNT_ID=@771inxtc`、`LINE_LOGIN_CHANNEL_ID=2012557414`、`LINE_PROVIDER_ID=2005057441`、`LINE_MESSAGING_PROVIDER_ID=2005057441`。`LINE_BOT_USER_ID` は未確認。MessagingチャネルIDをBotユーザーIDとして入れない。

## 実装した経路

### 登録・ログイン

- 既存会員は既存入口でログインし、設定画面で保存・利用に同意して同じ会員IDへLINEを連携する。既存プロフィール・投稿・会費の状態を上書きしない。
- 連携済みLINEだけでログインできる。会員の利用停止・期限判定は維持する。
- 新規登録は名前・メール入力 → 必須の規約/プライバシー同意とLINE保存同意 → メール確認コード → LINE本人確認 → 既存の初回プロフィール入力。
- メールと名前をLINEへ送らず、LINEのname/email claimsも会員情報へコピーしない。同じメール・同じLINEの既存会員を新規登録入口から自動統合しない。
- メールのお知らせは任意・初期OFF。LINE通知とは別の同意として記録する。確認コードは本人が依頼した場合にだけ送る。
- 新規登録draftは20分、メールコードは10分・5試行・60秒再送制限。ブラウザCookieと結び、登録確定のD1 batchで一度だけ消費する。メール確認だけでは会員を作らない。
- LINE用のdraftが既存Google登録のdraftを流用することはない。Google通常ログインが同意なしで会員を自動作成する経路も閉じた。

### 認可取消・LINE連携解除

- user access tokenをAES-256-GCMで暗号化保存し、会員/Provider/チャネル/LINE subject/鍵版をAADで結ぶ。refresh tokenは取得・保存しない。
- LINE発行セッションの利用時と通知の送信直前に、LINEのverifyとuserinfoで有効性・チャネル・openid scope・本人subjectを照合する。期限切れ・無効ならLINEセッション、通知同意、送信待ちを停止する。通信不明ならアクセス/送信を許可せず、勝手に会員を削除しない。
- 通常は約30日でtokenが切れる。自動更新はせず、本人がLINEで再認証する。LINE側の取消を即時検出するWebhookはなく、次のアクセス/送信時の確認になる。外部取消の瞬間から完全に無使用になる保証はしない。
- 設定画面またはログイン不要の `/account/privacy` で登録メールへコードを依頼できる。利用停止やLINEセッション失効時でも、メールで本人確認し解除へ進める。
- 本人確認後、通知を先に停止し公式 `POST /user/v1/deauthorize` を実行する。**HTTP 204だけ**を成功と扱う。400を「既に解除済み」と推測しない。401/403/通信不明/5xxも未完了のまま。
- 解除直前にLoginチャネルID/secretを `POST /oauth2/v3/token` へフォーム送信し、15分のstateless channel access tokenを都度発行する。発行tokenは処理中のメモリだけで使い、保存・共有cache・ログ・画面返却はしない。旧 `LINE_DEAUTH_CHANNEL_TOKEN` は不要かつ未使用。Messaging token/30日short-lived tokenには代替しない。
- 発行APIは200・Bearer・正の整数で900秒以下の期限・有効なtoken形式だけを受理する。発行と解除はそれぞれ10秒timeout、redirectを追わず、不明応答に自動再試行しない。発行失敗時は解除を送信しない。
- 発行の前後に、同じ会員/Provider/チャネル/subject/暗号credential/revision・未失効lease・本人確認grantの目的/期限をDB時刻で再照合する。発行待ちの間の取消・期限切れ・資格情報の差し替えでは解除を送信しない。stateless token自身の期限も、発行要求の開始から計算し最終照合後に再確認する。
- 失効tokenでは同じLINEを改めて本人確認し、解除専用の経路でtokenを更新して公式解除を再試行する。異なるLINE・通常ログインからpending状態を上書きしない。
- 解除用の本人確認grantは目的/会員/10分期限に限定し、ハッシュだけを保存する。取消・期限切れ・置換後の再利用を拒否する。既にLINEへの要求を送った後の処理は取り消せない。
- 公式解除成功後にLINE連携・暗号化token・LINEセッション・保留通知・関連OAuthフローを消す。独立したGoogleセッション、本人入力の名前/メール、会員登録・投稿は保持する。
- LINE連携解除後、Web再ログインには登録メールと同じGoogleアカウントが必要。Googleを用意できない場合は先に運営窓口で確認する。独立したWebメールログインは今回追加していない。

### 通知の基盤

- 対象は新着メッセージとオファー/リファラル。本文・相手の名前・取引条件は送らず、届いたこととTASUKIへのリンクだけを送る。広告配信・代理投稿・案件おすすめは対象外。
- 初期OFF、種別ごとの本人同意。ブロックのunfollowを通知停止に反映し、followや友だち状態は保存しない。ブロック解除だけでは再開しない。
- 送信待ちには同意版・同じ宛先/本文・同じretry UUIDを使う。最大5試行/20時間。受付成功・取消・最終失敗・期限切れ後に宛先識別子を消す。
- 認可有効性確認後に改めて会員資格・同意を確認する。解除/停止で保留分を取り消すが、送信中の要求は取り消せない場合がある。
- API受付成功は端末配達の保証ではない。LINEは未追加・ブロックなどの宛先でも成功応答を返すことがある。
- 友だち状態APIは呼ばない。openidで得たsubを、同じProviderのMessaging APIの宛先として使う。1対1の継続配信には公式アカウントの友だち追加が基本。未追加でも本人から1対1メッセージを受けてから7日以内は例外的にPushできるが、これを継続通知の前提にはしない。
- profile権限はPushに不要。profileが必要なのはLINE Loginのfriendship APIであり、trueは友だちかつ未ブロック、falseは未追加/ブロックを区別しない。openid+profileならID Tokenとuserinfoに表示名・画像URLが返るため、「受信しない」と「保存しない」は異なる。今回profileは要求せず、氏名/画像を照会・保存しない。
- 署名済みunfollow webhookでブロックに伴う通知停止は受け付けるが、友だち状態の現在値・履歴は蓄積しない。followイベントだけで通知同意を再開しない。

## Cloudflare設定

本体Worker `tasuki` のVariables and Secretsまたは対話式 `wrangler secret put` で設定する。秘密値をチャット、Git、wrangler.jsoncへ書かない。

| 設定 | 用途 |
|---|---|
| LINE_LOGIN_CHANNEL_ID / LINE_LOGIN_CHANNEL_SECRET | LoginチャネルIDとSecret。認証と解除用stateless tokenの都度発行に使用 |
| LINE_PROVIDER_ID / LINE_MESSAGING_PROVIDER_ID | 同じProvider IDを照合 |
| LINE_TOKEN_ENCRYPTION_KEY | Secret。32 byteの鍵をcanonical base64で指定 |
| LINE_TOKEN_KEY_VERSION | 鍵版。旧鍵移行未対応なので勝手に変更しない |
| LINE_MESSAGING_CHANNEL_TOKEN / LINE_MESSAGING_CHANNEL_SECRET | Secret。送信用token/署名確認用secret |
| LINE_BOT_USER_ID / LINE_OFFICIAL_ACCOUNT_ID | BotのUから始まるID / @から始まる公式ID |
| LINE_NOTIFY_CRON_TOKEN | Secret。32文字以上。本体と定期Workerに同じ値 |
| RESEND_API_KEY / AUTH_FROM_EMAIL / AUTH_CODE_PEPPER | 既存のメール本人確認設定。新規登録前に実送信元と配送を検証 |
| LINE_DATA_POLICY_READY | 保存・削除・復旧方針を決定し、公開ポリシーと実装を一致させてからtrue。法令適合をこの値だけで保証しない |
| LINE_LOGIN_ENABLED / LINE_SIGNUP_ENABLED | 個別の実環境検証後にtrue |
| LINE_NOTIFICATIONS_ENABLED | 本人同意、配達条件の表示、送達/停止/再送/通数確認後にtrue |
| ACCOUNT_ERASURE_ENABLED | 共有記録・バックアップ・画像削除失敗の方針が未完成のため、現時点で設定しない |

stateless tokenは発行後に失効させられず、15分で期限切れになる。手作業の解除用token更新は不要だが、Login secret自体の漏洩対策は引き続き必要。解除用stateless tokenの実発行は未実施。Login/Messagingの必要Secretと本体コードは配置済みだが、機能はOFF。

Provider一致は設定ミス防止であり実所属の証明ではない。管理画面の所属・公式アカウント連携・token対象を確認する。

### 定期Workerと一時データの削除

`wrangler.line-notifications.jsonc` の `tasuki-line-notifications` は5分ごとにサービスバインディングで本体APIを呼ぶ。D1やLINE tokenは渡さず、専用cron tokenだけを持つ。専用Workerは本人の具体的承認後に作成し、scheduled-onlyコード（HTTP fetch handlerなし）とTASUKI→tasuki service bindingを配置済み。workers.dev/PreviewはOFF、独自ドメイン/経路なし。未使用の専用cron secretだけを本体・新Workerで同値に更新し、旧25設定と全5フラグfalseを保持。5分Cronは最終保存・再読込で残存を確認し、2026年11月12日15:40:53 JSTの自然実行がoutcome=okで完了。専用Worker版は2b52d680、本体の専用secretのみ更新した版は23c008df。LINEの実通知・実認証の合格とは区別する。Wrangler設定にも `workers_dev: false` / `preview_urls: false` を記載し、再配備で公開口を復活させない。

通知OFFでも定期APIの先頭で期限切れOAuthフロー、登録draft、解除コード/grantを清掃する。通常の設定アクセス・次の登録時にも清掃するが、**有効期限と物理削除時刻は別**。定期Workerの配置・成功監視がない状態で、期限ちょうどの消去を約束しない。LINEログインのみ有効化する場合も清掃の定期実行が必要。

通知再送は1回最大50件。無料枠・月間上限・費用を運営が決め、勝手に有料プランへ変更しない。

### 運営限定の接続診断（次の公開候補）

`GET /api/admin/line-connection` は既存の運営認証、または明示指定された有効会員本人の限定試験認証を必須とし、保存済みMessaging tokenで公式 `GET https://api.line.me/v2/bot/info` だけを参照する。5秒timeout・redirect禁止・外部本文32KB制限・no-store。戻り値はBot ID、公式ID、設定済みBot IDとの一致だけで、名前/画像/秘密/外部エラー本文は返さない。通知・token発行・設定保存は行わない。公式ID不一致や不正IDを拒否し、設定済みBot ID不一致は409とする。

これはBotの識別確認であり、通知の実配送やLINEログインの合格ではない。隔離35ケースと本人限定認証の追加ケース・lint/typecheck/buildは通過したが、診断ルート自身の公開と実LINE接続はまだ未実施。取得したBot IDを運営が確認してから通常の `LINE_BOT_USER_ID` へ設定する。

## 本人限定の実受信テスト（一般提供とは別）

本人から、現在ログインしている本人のTASUKI会員・LINEだけを対象に、登録メールへ確認コード1通、LINEテスト通知最大2通の承認を受領。ここに実メールアドレスや会員IDは記録しない。実送信はまだ未実施。

- Cloudflareの `LINE_TEST_MEMBER_ID` で、ブラウザの既存セッションを読み取り確認した本人の会員IDだけを指定する。`getAppAccess` の有効会員とID完全一致を要求。既存 `getAdmin` / `ADMIN_EMAILS` は変更せず、管理画面の権限を追加しない。
- LINE関連4フラグと自動退会はすべて文字列falseを維持する。どれかがtrue、未設定、不正値なら限定試験も閉じる。一般ログイン/新規登録/通常通知のready判定は変更しない。
- `/admin/line-test` の専用 `test_link` だけが既存PKCE/state/nonce/同じ会員sessionの照合で本人LINEを連携する。通常のLINEログインセッション発行・新規登録・通知同意ONは行わない。試験同意を画面でも確認する。
- `/api/admin/line-test` の本人認証・同一Origin・固定本文・slot 1/2のみ。クライアント指定の宛先/本文/会員IDは拒否する。Bot診断では、Bot IDが未設定でも指定本人に識別情報の読取だけを許可する。
- `line_test_budget` の固定案件に2枠。各Push HTTP試行の前に原子的に消費し、同時クリック・失敗・結果不明・日付/会員設定変更・解除・退会で枠を戻さない。自動再送なし。外部認可確認と送信直前に同じlinked_at/revisionを照合する。
- 台帳にLINEの宛先・本文・tokenは保存しない。終了・解除・退会で台帳のTASUKI会員IDと紐付けメタデータも消し、閉鎖と枠の使用状況だけ残す。既に送信中のHTTPは取り消せず、LINE受付は端末配達とは別。
- 試験終了とLINE連携解除は別。終了と進行中OAuthが競合すると連携の保存だけは完了する場合がある。必要に応じ既存のメール本人確認で解除し、結果を確認する。
- 確認メールは既存privacy経路で1回だけ依頼し、不明でも再送しない。今回の1通上限は実行記録で管理し、通常の本人確認メール機能そのものを全会員向けに1通へ制限したわけではない。
- テスト終了後は `LINE_TEST_MEMBER_ID` を未設定にする。D1 Time Travelや手動復旧では台帳も巻き戻り得るため、**復旧前にもこの設定を外し、枠の消費記録を照合するまで再設定しない**。通常操作での2枠保証と、バックアップ復元は区別する。
- LINE Loginは開発中を維持。本人LINEがチャネルの許可された利用者でなければ停止し、一般公開に切り替えて回避しない。今回の試験はLINE一般ログイン・新規登録・停止/ブロック等の全実環境E2E合格を意味しない。

## 退会とバックアップの制限

`deleteMobileAccount` はLINE連携が残っていれば先に公式解除を要求する。取引・請求・紹介特典・例会等の共有記録がある場合は無変更で拒否し、運営判断へ回す。未知の外部キーがあってもD1 batchをrollbackする。R2削除が失敗した場合は完了と偽らない。ただし再削除ジョブと運営記録は未整備。詳細は `account-withdrawal-safety.md`。

今後のR2 dumpでは全line_表を除外する。本人入力の会員情報は既存バックアップに含まれる。過去のバックアップ、D1 Time Travel（Freeは7日、Paidは30日。現アカウントはFree）、ダウンロード済み控えを消去したことにはならない。退会記録と復元後の再削除、LINE再連携/通知同意の再取得、鍵を含む障害復旧の運用を決める必要がある。旧LINE由来メール会員の任意通知は、由来/同意記録が欠けた復元でも送らない。

## 未決定事項と公開順序

1. openid限定・友だち状態照会なしの通知方式について、実画面と許可テスターの配達/停止を検証する。メール権限申請は行わない。
2. 保存期間、退会後に残す共有/請求情報、バックアップからの再消去、LINE本人確認できない人の運営受付を決める。オンライン退会は完成するまでOFF。
3. 下記のプライバシー草案を運営が確認し、公開 `/privacy` に反映する承認を得る。法令/LINE規約の適合宣言を未確認のまま提出しない。
4. 最新本番との統合、lint/typecheck/preflight、隔離APIテスト、360/390/430pxの実画面確認を完了する。
5. 正当な公開権限と許可された方法でコードを公開する。既存公開操作の拒否を別経路で回避しない。
6. 安全な経路でSecretsを設定し、開発中LINEチャネルの許可されたテスターで登録・連携・外部取消・解除・再認証を検証する。既存会員ID/投稿/課金を変えないことも確認する。
7. 定期清掃/再送Workerを配置して動作を確認。通知テストは受信者本人の同意とプラン/予算を確認して限定実施する。
8. 完了した機能だけ段階的に有効化。失敗時は用途別ENABLEDをfalseに戻し、テーブルを消さない。Google入口は維持する。

## プライバシーポリシー追記草案（未承認・公開不可）

LINE連携を選んだ方について、LINEユーザーIDと認証トークンを取得し、本人確認、会員アカウントとの紐付け、LINEログイン、連携管理、ご本人が希望したLINE通知に利用します。認証トークンは暗号化して保存します。これらの情報は、画面で保存・利用への同意を得た上で、連携中は24時間を超えて保存します。LINEのお名前・メールアドレスは取得せず、会員のお名前・メールアドレスはTASUKIの登録画面でご本人が入力し、メール確認コードで確認した情報を使用します。

LINE通知は初期状態で無効です。選択した種類のお知らせをLINEへ送ることに同意された場合のみ、LINEヤフー株式会社のMessaging APIを利用して新しいメッセージ・オファーが届いたことを通知します。相手の氏名、やり取りの本文、取引条件は通知に含めません。公式LINEの友だち追加をご案内しますが、友だち・ブロック状態は照会・保存しません。未追加・ブロック等の配達条件によっては、通知設定や送信受付が成功しても届かない場合があります。ブロックを知らせるWebhookを受けた場合は通知設定を停止し、ブロック解除だけでは再開しません。

メールのお知らせはLINE通知と別の任意同意です。希望しない場合も登録できます。メールとLINEのお知らせはそれぞれ停止できます。メール確認や連携解除の確認コードは、ご自身が送信を依頼した場合に登録メールへ送ります。

LINE認可の有効性をログイン利用時と通知送信前に確認し、期限切れ・無効時はLINEログインと通知を停止します。LINE側で同意を取り消した瞬間の検知を保証するものではありません。認証が切れた場合は、必要に応じてご自身でLINEの本人確認を行います。

TASUKI側でLINE連携を解除すると通知を停止し、LINE側のTASUKIとの連動解除を行います。LINE側の解除が確認できない場合は、解除完了とは表示せず、再試行またはご本人確認をご案内します。解除成功後にLINEユーザーID、暗号化認証トークン、送信待ちを含むLINE通知記録、LINEログインのセッションを削除します。会員登録自体は残るため、ご本人が入力したお名前・メールアドレス・投稿はこの操作では削除されません。LINE以外のログイン方法を事前にご確認ください。

退会、共有・請求等の記録、バックアップに残る情報の期間と削除方法、LINEをご本人確認できない場合の窓口手順は運営確認中です。この草案のまま利用を開始せず、法令・LINE規約への適合宣言には使用しません。

## 実装画面の同意文言

必須の登録同意（2026-11-11-v4）:
「LINEのユーザーIDと暗号化した認証トークンを、ログイン・連携管理と希望したLINE通知のために取得し、連携中は24時間を超えて保存・利用することに同意します。お名前・メールアドレスはLINEから取得せず、この画面でご本人が入力した情報を使用します。LINE通知とメールのお知らせは別々に選べます。」

任意メール同意は登録画面で別選択。規約/プライバシーとLINE保存同意の両方をサーバーでも確認し、同意版/日時を保存する。メール権限申請スクリーンショットの提出は行わない。

## 検証

```sh
npm run lint
npm run typecheck
npm run preflight
node tests/line-connection-diagnostics.mjs
node tests/line-signup-runtime.mjs
node tests/line-runtime.mjs
node tests/line-email-runtime.mjs
node tests/line-privacy-runtime.mjs
node tests/line-token-crypto-runtime.mjs
node tests/line-authorization-runtime.mjs
node tests/account-withdrawal-runtime.mjs
node tests/account-withdrawal-auth-audit.mjs
node tests/line-feature-gates.mjs
node tests/line-scheduler-runtime.mjs
node tests/line-auth-integration.mjs
node tests/signup-entry-runtime.mjs --api-only
node tests/meeting-auth-integration.mjs
```

LINE full HTTPテストはビルド済み実ルートと隔離D1を使用し、ブラウザは起動しない。LINE/Google/メールはすべて偽応答。実画面は接続されたMacの隔離React fixtureで別途確認し、APIテストと混同しない。ブラウザ起動やネットワークが拒否された経路は再試行で回避しない。

## 公式資料

- [LINE Login Web連携](https://developers.line.biz/ja/docs/line-login/integrate-line-login/)
- [PKCE](https://developers.line.biz/ja/docs/line-login/integrate-pkce/)
- [ID Token検証](https://developers.line.biz/ja/reference/line-login/#verify-id-token)
- [friendship APIとprofile scope](https://developers.line.biz/en/reference/line-login/#get-friendship-status)
- [LINE開発ガイドのdeauthorize要件](https://developers.line.biz/en/docs/line-login/development-guidelines/)
- [LINE認可/解除API](https://developers.line.biz/en/reference/line-login/)
- [stateless channel access token発行](https://developers.line.biz/en/reference/messaging-api/nojs/#issue-stateless-channel-access-token)
- [チャネルtokenの種類・期限・失効制限](https://developers.line.biz/en/docs/basics/channel-access-token/)
- [LINE側の連動アプリ管理](https://developers.line.biz/ja/docs/line-login/managing-authorized-apps/)
- [Webhook署名](https://developers.line.biz/ja/docs/messaging-api/verify-webhook-signature/)
- [同じProviderのユーザーID](https://developers.line.biz/en/docs/messaging-api/getting-user-ids/)
- [Pushの配達条件](https://developers.line.biz/en/reference/messaging-api/nojs/#send-push-message)
- [通知再試行](https://developers.line.biz/ja/docs/messaging-api/retrying-api-request/)
- [LINEユーザーデータポリシー](https://terms2.line.me/LINE_Developers_user_data_policy?lang=ja)
