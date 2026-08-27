# GIVE HUB / 守成クラブ会員向けアプリ 引き継ぎ

更新: 2026-08-27（Claudeによる再検証・作業基点をGitHubへ移行）

## ゴール

守成クラブ会員向けの「こんな人を探しています」掲示板を、WebサービスとiOS / Androidアプリとして完成させ、両ストアで正式公開する。

## 作業基点

作業の正はこのGitHubリポジトリ `shawfutamata/shusei`。実装・検証・コミットはリポジトリ側で完結させる。

- 開発ブランチ: `claude/codex-chat-handoff-dbw0m2`
- Web / API: リポジトリ直下（Next.js on Cloudflare Sites）
- Expoアプリ: `mobile/`
- 公開Web: `https://give-hub-shusei.shaw-futamata.chatgpt.site`
- Expo project: `@shusei_system/member-hub`
- EAS project ID: `fdcf0a27-45e7-4fb0-b198-4f0eb165e2d9`
- Expo dashboard: `https://expo.dev/accounts/shusei_system/projects/member-hub`

ローカルMac（`/Users/shawfutamata/Documents/ChatGPT/private/shusei-give-board`）が要るのは、Apple / Expo / ストアの対話ログインを伴う操作だけ。コードはGitHubから取得する。

## アプリ識別子

- iOS bundle ID: `jp.everycounts.memberhub`
- Android package: `jp.everycounts.memberhub`
- Expo SDK: 57
- アプリ版: 1.0.0
- 表示名: 現在 `GIVE HUB`。`mobile/app.config.ts` の `APP_DISPLAY_NAME` で後から変更可能
- サービス名・機能はまだ確定前。ストア公開後はbundle ID / package変更を避ける

## 実装済み

- Expo RouterによるiOS / Android共通アプリ
- メールOTP認証、30日Bearerセッション、SecureStore保存
- 有効会員だけを許可するサーバー側利用権限ゲート（Web・アプリ両経路）
- 下部5タブ: ホーム、困りごと、投稿、名刺、マイページ
- 探しごとの投稿、一覧、詳細、紹介回答、閲覧履歴、お気に入り
- 大分類 / 詳細業種の2階層タグと関連業種通知設定
- 会場、都道府県、年商、肩書き、緑・赤・ゴールド・ダイヤモンドの区分
- 顔写真必須プロフィール、写真選択とトリミング
- 紹介数・ポイント・ランクカード
- 名刺のカメラ撮影 / 複数画像選択
- 日本語 / ラテン文字の端末内ML Kit OCR
- 読取結果モーダルで確認・修正してから保存
- Expo Push登録、業種一致通知、通知タップから対象投稿へ遷移
- 無効なExpo端末トークンの削除
- アプリ内アカウント削除
- ストアアイコン、Google Playフィーチャー画像、審査文面、プライバシー申告下書き

主要資料:

- `docs/release-checklist.md`
- `docs/member-provisioning.md`
- `docs/store-listing-ja.md`
- `docs/app-review-notes-ja.md`
- `docs/privacy-declarations-ja.md`
- `docs/store-screenshot-plan-ja.md`
- `docs/store-assets.md`
- `docs/billing-architecture.md`

## 課金方針

ネイティブアプリは、別途契約済みの会員が使う無料コンパニオンとして設計している。

アプリ内には次を置かない:

- 購入、契約、アップグレード、プラン変更
- 価格や割引の表示
- Web決済へのリンクや購入を促す文言
- 有料ポイント、ランク、投稿ブースト

契約・決済・解約はアプリ外で独立して行い、アプリはサーバーの有効会員判定だけを見る。Apple手数料回避を目的に見える誘導は審査リスクがあるため、提出前に販売形態と最新ガイドラインを再確認する。

## 利用権限（2026-08-27に変更）

利用可否は `members.membership_status` だけで決まる。運用手順は `docs/member-provisioning.md`。

- 初回ログインで自動作成される行は `invited`。運営が `active` にするまでWebもアプリも使えない
- 既存の有効会員の状態は変えていない。新規行の既定値だけを変更した
- 401（未ログイン）と403（利用権限なし）をWeb・アプリの全16ハンドラで統一

**変更前は、ChatGPTでログインしただけの第三者が自動的に有効会員になっていた。** Sitesを公開アクセスへ切り替えていたら掲示板・会員プロフィール・顔写真が誰でも見える状態だったため、公開前提の前提条件として先に塞いだ。

既知のギャップ: 利用権限が切れたアプリ利用者には `/api/mobile/auth/session` が401を返すため、`MembershipAccess.canUseApp` を使ったアプリ内の「権限がありません」画面には到達しない。実機確認の前に、無効会員向けの表示経路を決める。

## EAS / ビルド状況

このリポジトリからは検証できないため、以下は前任セッションの申告をそのまま残す。再開時にExpo dashboardで現況を確認すること。

Expo CLIログイン済み:

- 実行ユーザー: `colourjam`
- 所属アカウント: `shusei_system` Owner

Android preview buildは完了:

- Build ID: `c1bd9fac-02da-48f2-9f68-6702194222b7`
- Status: `FINISHED`
- APK: `https://expo.dev/artifacts/eas/yEWFpTI3mtx3hDffZV-uPBX39CCMkXmh6ujFdmd4YAI.apk`
- 有効期限: 2026-09-10
- Android versionCode: 1
- EASがリモートkeystoreを作成済み

iOS preview buildは未完了。Apple ID入力待ちのCLIをユーザー側へ表示できなかったため、待機プロセスは終了済み。

再開はユーザーが見える通常のMacターミナルで実行する:

```bash
npx eas-cli build --platform ios --profile preview
```

ユーザー本人に、Apple ID、パスワード、2段階認証コードをそのターミナルへ直接入力してもらう。認証情報をチャットへ貼らせない。Apple Developer Team、証明書、Provisioning Profile、実機登録の追加質問が続く可能性がある。

## Web / API状況

前任セッションの申告（このリポジトリからは未検証）:

- Sites本番バージョン37をデプロイ済み
- 現状は所有者限定公開（許可ユーザー1、グループ0、外部訪問者0）
- 未登録メールの `/api/mobile/auth/request-code` はHTTP 400で拒否されることを本番確認済み

リポジトリで確認済み:

- APIベースURLは `mobile/app.config.ts` と `mobile/.env.example` に設定済み
- 本番のテーブル定義を作るのは `db/data.ts` の `ensureDatabase()`。`db/schema.ts` と `drizzle/` は参照用で実行時には適用されない

未設定:

- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- 審査専用メールを有効会員として登録
- 審査専用6桁コード（`REVIEW_AUTH_EMAIL` / `REVIEW_AUTH_CODE`）をSitesの秘密環境変数に設定
- FCM V1 / APNsの本番通知資格情報と実機通知確認

## 検証済み（2026-08-27、クリーンなクローンで実行）

| 検証 | 結果 |
|---|---|
| `npm run lint` | 通過（`<img>` 警告6件のみ） |
| `npm run typecheck` | 通過 |
| `npm run build`（vinext） | 通過 |
| `mobile` の `npx tsc --noEmit` | 通過 |

修正した点:

- ルートの `tsconfig.json` が `mobile/` まで型検査対象にしていたため、`mobile/node_modules` がある環境でしか `tsc` が通らなかった。ルートをWebアプリだけに限定した
- その裏に隠れていた型エラー10件を修正した。つまり**前回の「TypeScriptチェック通過」はクリーンなクローンでは再現しない状態だった**
- `tsconfig.tsbuildinfo` はビルド生成物なのでGit追跡から外した
- GitHub ActionsでWeb（lint / typecheck / build）とExpo（tsc）をpushごとに検証する

注意: `mobile` には eslint の設定も依存も無いため、`npx expo lint` は何も検査せずに終了0を返す。前回の「Expo lint通過」は実質的に無検査。Expo側のlintを効かせるなら設定の追加が必要。

`expo-doctor` は前任セッションで20/21。唯一の警告は `rn-mlkit-ocr` のNew Architecture未検証。

## Git

- `main` と開発ブランチ `claude/codex-chat-handoff-dbw0m2` にpush済み
- この引き継ぎファイルは既にコミット済み（前回の「未コミット」は解消済み）
- `tsconfig.tsbuildinfo` は追跡対象外

## 次に行う順序

### A. リポジトリだけで進められる（外部アカウント不要）

1. 無効会員向けのアプリ内表示を決めて実装する（上記の既知のギャップ）
2. 販売形態（個人契約 / 法人・会場単位）を確定し、`docs/store-listing-ja.md` と `docs/app-review-notes-ja.md` を合わせる
3. サービス名を確定する場合は `APP_DISPLAY_NAME` とストア文面・プライバシー申告を同時に更新する
4. 利用権限の運用を決済Webhookまたは運営管理画面につなぐ設計（現状はSQL直実行）

### B. ユーザー本人の入力・アカウントが要る

5. Android APKを実機へ入れ、ログイン以外の画面起動、カメラ、複数名刺OCR、プロフィール写真、投稿遷移を確認
6. 通常のMacターミナルでiOS EAS buildを再開し、ユーザー本人にApple認証を入力してもらう
7. iOS previewを実機へ入れ、同じ主要導線を確認
8. Resendと送信元をSitesへ設定し、通常OTPメールを実機確認
9. 審査専用の有効会員と固定コードを安全な秘密環境変数へ設定（`docs/member-provisioning.md`）
10. Sites公開アクセスへ変更し、未認証・無効会員・有効会員のAPI境界を再検証（401 / 403 / 200）
11. APNs / FCMとExpo Pushを両実機で確認
12. App Store Connect / Google Play Consoleにアプリを作成し、素材・データ申告・審査情報を登録
13. production buildを作成して両ストアへ提出
14. 審査指摘へ対応し、公開確認後に審査専用固定コードを削除して審査会員を停止

## 注意事項

- Apple ID / パスワード / 2FAコードはチャットで受け取らない
- Secretsをコマンド出力やGitへ残さない
- Webの公開URLが見えるだけでは完了扱いにせず、アクセス範囲と実機導線を確認する
- ストア承認まではサービス名と機能を変更可能。ただしストア素材、審査文面、プライバシー申告と必ず同期する
- DBのカラムを足すときは `db/schema.ts` だけでなく `db/data.ts` の `ensureDatabase()` を必ず更新する
