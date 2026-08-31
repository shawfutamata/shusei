# ストア用プライバシー申告表（下書き）

実装と申告内容を一致させるための入力用メモ。ストア提出直前に、採用したメール・決済・監視SDKを含めて再監査する。

## 共通回答

- データを収集する: はい
- データを第三者広告へ利用する: いいえ
- ユーザー追跡: いいえ
- データ販売: いいえ
- 通信中の暗号化: はい（HTTPS）
- アカウント削除: アプリ内から可能
- 画像: 利用者が選んだ写真を端末内で縮小してから送信する

## 収集データ

| ストア分類 | 実データ | 必須/任意 | 目的 | 第三者共有 |
|---|---|---|---|---|
| 氏名 | 会員氏名 | 必須 | アカウント管理、オファー機能 | サービス提供者のみ |
| メールアドレス | ログインメール | 必須 | 認証、アカウント管理 | メール送信事業者 |
| ユーザーID | 内部会員ID | 必須 | 認証、データ所有者の分離 | サービス提供者のみ |
| 写真 | 顔写真、探しごとの写真 | 顔写真は必須、探しごとの写真は任意 | プロフィール確認、掲示板の表示 | 会員に公開 |
| 住所 | 活動エリア | 任意 | 絞り込み、オファー先の目安 | 会員に公開 |
| ユーザーコンテンツ | 投稿、オファーの理由、コメント | 機能利用時 | 掲示板・オファー機能 | 投稿・オファー先の会員 |
| デバイスID等 | Expo Push Token | 通知利用時 | プッシュ通知 | 通知配信事業者 |

## 収集しないデータ

- GPSまたは端末由来の正確・おおよその位置情報
- 端末の連絡先帳
- マイク音声
- 広告ID
- 閲覧履歴を使った広告プロファイル
- 健康、決済カード、銀行、パスワード情報

## 利用するサービス提供者

- Cloudflare / Sites: API、データベース、画像保存
- Stripe: 有料プランと広告枠の決済（Webのみ。アプリからは決済しない）
- Resend: ログイン認証メール
- Expo: Push Token発行と通知配信
- Apple / Google: アプリ配布とOS通知基盤

これらはサービス提供のための処理委託先として扱い、広告目的の共有は行わない。

## iOS プライバシーマニフェスト

`mobile/app.config.ts` の `ios.privacyManifests` から `PrivacyInfo.xcprivacy` を生成する。宣言しているのは required reason API の2件だけ。

| API種別 | 理由コード | 該当箇所 |
|---|---|---|
| `NSPrivacyAccessedAPICategoryFileTimestamp` | `C617.1` | 利用者が選んだ顔写真・探しごとの写真を扱うため（expo-image-picker / expo-image-manipulator） |
| `NSPrivacyAccessedAPICategoryUserDefaults` | `CA92.1` | アプリ自身の設定保存（expo-modules-core） |

`NSPrivacyTracking` は `false`、`NSPrivacyTrackingDomains` は空。

`NSPrivacyCollectedDataTypes` は意図的に空にしている。アプリが集める情報の開示は App Store Connect の App Privacy 質問票（上表「収集データ」）が正であり、二重管理して食い違わせないため。SDK側の申告は各Expoモジュール・React Nativeが同梱する `PrivacyInfo.xcprivacy` が担う。

`app.config.ts` を変更したら `npx expo prebuild --platform ios --clean` で生成結果を確認する。

## 提出直前の再確認

- [ ] 実際のアプリバイナリに分析・クラッシュSDKが追加されていない
- [x] Apple Privacy Manifest（`ios.privacyManifests`）を設定し、生成を確認
- [ ] 提出前にビルド後の警告（ITMS-91053 / ITMS-91061）を確認し、指摘があれば宣言を追加
- [ ] Google Play SDK IndexとData safety回答を照合
- [ ] プライバシーポリシー本文と本表が一致
- [ ] アカウント削除URLが公開アクセス可能
