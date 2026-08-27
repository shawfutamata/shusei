# GIVE HUB / 守成クラブ会員向けアプリ 引き継ぎ

更新: 2026-08-27

## ゴール

守成クラブ会員向けの「こんな人を探しています」掲示板を、WebサービスとiOS / Androidアプリとして完成させ、両ストアで正式公開する。

## 作業場所

- Web / API: `/Users/shawfutamata/Documents/ChatGPT/private/shusei-give-board`
- Expoアプリ: `/Users/shawfutamata/Documents/ChatGPT/private/shusei-give-board/mobile`
- 公開Web: `https://give-hub-shusei.shaw-futamata.chatgpt.site`
- Expo project: `@shusei_system/member-hub`
- EAS project ID: `fdcf0a27-45e7-4fb0-b198-4f0eb165e2d9`
- Expo dashboard: `https://expo.dev/accounts/shusei_system/projects/member-hub`

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
- 有効会員だけを許可するサーバー側利用権限ゲート
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
- `docs/store-listing-ja.md`
- `docs/app-review-notes-ja.md`
- `docs/privacy-declarations-ja.md`
- `docs/store-screenshot-plan-ja.md`
- `docs/store-assets.md`

## 課金方針

ネイティブアプリは、別途契約済みの会員が使う無料コンパニオンとして設計している。

アプリ内には次を置かない:

- 購入、契約、アップグレード、プラン変更
- 価格や割引の表示
- Web決済へのリンクや購入を促す文言
- 有料ポイント、ランク、投稿ブースト

契約・決済・解約はアプリ外で独立して行い、アプリはサーバーの有効会員判定だけを見る。Apple手数料回避を目的に見える誘導は審査リスクがあるため、提出前に販売形態と最新ガイドラインを再確認する。

## EAS / ビルド状況

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
cd /Users/shawfutamata/Documents/ChatGPT/private/shusei-give-board/mobile
npx eas-cli build --platform ios --profile preview
```

ユーザー本人に、Apple ID、パスワード、2段階認証コードをそのターミナルへ直接入力してもらう。認証情報をチャットへ貼らせない。Apple Developer Team、証明書、Provisioning Profile、実機登録の追加質問が続く可能性がある。

## Web / API状況

- Sites本番バージョン37をデプロイ済み
- 現状は所有者限定公開（許可ユーザー1、グループ0、外部訪問者0）
- 未登録メールの `/api/mobile/auth/request-code` はHTTP 400で拒否されることを本番確認済み
- APIベースURLは `mobile/app.config.ts` と `mobile/.env.example` に設定済み
- 公開アクセス変更は、認証と審査用会員を用意してから明示確認を取って実施する

未設定:

- `RESEND_API_KEY`
- `AUTH_FROM_EMAIL`
- 審査専用メールを有効会員として登録
- 審査専用6桁コードをSitesの秘密環境変数に設定
- FCM V1 / APNsの本番通知資格情報と実機通知確認

## 検証済み

- TypeScriptチェック通過
- Expo lint通過
- iOS / Android Metro production bundle通過
- iOS / Android native prebuild通過
- `expo-doctor` は20/21。唯一の警告は `rn-mlkit-ocr` のNew Architecture未検証
- Android EASクラウドビルド成功により、Androidネイティブビルドは実証済み

## Git

最新コミット:

```text
f0b87e0 Connect native app to EAS project
34ab59e Enforce active member access for mobile
e4945ca Persist request history and favorites on mobile
dac8351 Route push notifications to matching requests
64a2d36 Harden mobile notification and store policy flows
d2c06ee Add secure store review login path
```

`main`へpush済み。現在の既存未コミット変更は `tsconfig.tsbuildinfo` のみで、ユーザー由来として触らない。この引き継ぎファイル自体は新規未コミット。

## 次に行う順序

1. Android APKを実機へ入れ、ログイン以外の画面起動、カメラ、複数名刺OCR、プロフィール写真、投稿遷移を確認
2. 通常のMacターミナルでiOS EAS buildを再開し、ユーザー本人にApple認証を入力してもらう
3. iOS previewを実機へ入れ、同じ主要導線を確認
4. Resendと送信元をSitesへ設定し、通常OTPメールを実機確認
5. 審査専用の有効会員と固定コードを安全な秘密環境変数へ設定
6. Sites公開アクセスへ変更し、未認証・無効会員・有効会員のAPI境界を再検証
7. APNs / FCMとExpo Pushを両実機で確認
8. サービス名、契約形態、ストア文面を最終確定
9. App Store Connect / Google Play Consoleにアプリを作成し、素材・データ申告・審査情報を登録
10. production buildを作成して両ストアへ提出
11. 審査指摘へ対応し、公開確認後に審査専用固定コードを削除して審査会員を停止

## 注意事項

- Apple ID / パスワード / 2FAコードはチャットで受け取らない
- Secretsをコマンド出力やGitへ残さない
- `tsconfig.tsbuildinfo` を勝手にrevert / stageしない
- Webの公開URLが見えるだけでは完了扱いにせず、アクセス範囲と実機導線を確認する
- ストア承認まではサービス名と機能を変更可能。ただしストア素材、審査文面、プライバシー申告と必ず同期する
