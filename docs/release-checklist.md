# 正式公開チェックリスト

進める順序は `docs/release-runbook-ja.md`（**Web先行 → アプリ**）。ここは状態の一覧。

## 現在完了

- [x] React Native / Expo SDK 57 のiOS・Android共通実装
- [x] メールOTP認証（アプリはBearer、WebはHttpOnly Cookie。セッションは共通）
- [x] Webのメールログイン画面 `/login`
- [x] 有効化済み会員だけを許可するサーバー側利用権限ゲート（Web・アプリ両経路。運用は `docs/member-provisioning.md`）
- [x] SecureStoreへの端末セッション保存
- [x] ホーム、困りごと、投稿、マイページの4タブ
- [x] 顔写真必須プロフィールとトリミング
- [x] 関連業種のExpo Push登録・送信
- [x] アプリ内アカウント削除
- [x] アプリ外契約・アプリ内決済なしの課金境界
- [x] Web本体・無料コンパニオンアプリの課金設計を文書化
- [ ] 個人契約または法人・会場単位契約の販売形態を申請前に確定
- [ ] 利用権限の決済Webhookまたは運営管理連携（現状はD1へSQL直実行）
- [x] 利用権限が無い会員向けのアプリ内表示と、その状態からのアカウント削除
- [x] pushごとのCI（Web: lint / typecheck / build、Expo: tsc）
- [x] 1024pxストアアイコン
- [x] Google Play 1024×500フィーチャーグラフィック（サービス名非依存）
- [x] プライバシーポリシー下書き
- [x] Apple / Google審査メモ下書き
- [x] iOSプライバシーマニフェスト（`ios.privacyManifests`）
- [x] 公開サポートページ `/support`
- [x] `eas.json` の submit プロファイル（値は環境変数）
- [x] App Privacy / Data safety申告表下書き
- [x] ストアスクリーンショット5枚構成と撮影条件
- [x] iOS / Android Metro production bundle検証
- [x] iOS / Android native prebuildと日英OCRモデル設定検証

## アカウント接続後

- [ ] Resend APIキーと認証メール送信元を設定
- [ ] 審査専用メールを有効会員として登録し、6桁コードをSitesの秘密環境変数へ設定
- [ ] Sitesを公開アクセスへ変更し、Bearer保護APIを実機確認
- [ ] ExpoアカウントへログインしEAS projectIdを確定
- [ ] iOS preview buildを実機配布
- [ ] Android preview buildを実機配布
- [ ] Apple Developer ProgramのTeam / App ID / 証明書を接続
- [ ] Google Play Consoleのアプリ / 署名鍵を接続
- [ ] App Store ConnectとGoogle Playのスクリーンショットを登録
- [ ] 審査用アカウントと審査メモを登録
- [ ] 両ストアへ提出し、指摘対応後に公開を確認
- [ ] 両ストア承認後、審査用会員を停止して固定コードの秘密環境変数を削除
