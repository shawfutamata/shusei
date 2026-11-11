# ガイド後のホーム画面追加案内

2026-11-11。ガイド完了後、スマートフォンのブラウザで任意の追加手順を表示する。途中スキップは従来どおり閉じる。追加案内を閉じると従来のプロフィール登録へ進む。マイページの「使い方をもう一度見る」から再表示できる。standalone 起動時には表示しない（通常ブラウザから開いた時のインストール済み状態は一律には判定できない）。

## 公式資料
- Apple: https://support.apple.com/ja-jp/guide/iphone/iphea86e5236/ios （検索ツールは429、通常HTTP取得で公式本文を確認。共有メニュー、アクション編集、ウェブアプリとして開くを確認）
- Google Chrome Help: https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&hl=ja （メニューの新表記「インストールしてショートカットを作成」を確認）
- Chrome Developers: https://developer.chrome.com/blog/how_chrome_helps_users_install_the_apps_they_value?hl=ja （旧表記「ホーム画面に追加」からの追加手順）
- web.dev: https://web.dev/articles/customize-install （beforeinstallprompt は受信後のユーザー操作で一度だけ使用。appinstalled と display-mode 検出）

iOS の追加はブラウザ共有メニューでユーザーが操作する。Android の直接追加ボタンは beforeinstallprompt を受信した場合だけ表示し、キャンセル・例外時は手動手順を残す。OS・ブラウザ版による名称や形の違いを明記。LINE等のアプリ内ブラウザでは Safari/Chrome で開く案内。通信が必要で、オフライン利用は約束しない。

## 配信設定の調査
本番 https://tasuki.club/manifest.webmanifest がHTTP200。name は TASUKI｜オファー掲示板、short_name は TASUKI、start_url /、scope /、display standalone、192/512 PNG（any/maskable）を確認。ソースの layout に appleWebApp capable/title と apple-touch-icon の指定あり。既存アイコンをそのまま案内に表示する。manifest・権限・認証・サービスワーカーは変更していない。

## 検証
- 対象ESLint: エラー0（BoardClient/Tutorialの既存警告あり）。TypeScript: 通過。
- 端末判定の5ケース: iPhone / Android / PC / iOS standalone / iPadデスクトップUAを通過。
- 全体のローカル起動は uv_interface_addresses EPERM で停止。コンポーネント描画用のChromiumもsocket EPERMで停止。昇格実行でも同じ結果。視覚確認、実機のSafari/Chrome追加メニュー、ホーム画面からの起動、全体preflightは未完了。
- 未検証のまま公開しない。QA環境で360/390/430px、閉じる/再開/スキップ/戻る、Androidプロンプト拒否/成功/失敗、standalone非表示を確認する。
