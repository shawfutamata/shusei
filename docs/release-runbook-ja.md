# 公開ランブック（Web先行 → アプリ）

更新: 2026-08-28

`docs/release-checklist.md` が「何が終わったか」の一覧、この文書が「どの順で何をやるか」。

## 方針

**Webサービスを先に公開し、アプリはあとから出す。** ストア審査もクローズドテストも待たずに会員へ届けられる。待っている間に開発者アカウントの本人確認が進み、実際の会員のフィードバックでストア文面と機能を固められる。

Web版はアプリとほぼ同じことができる。掲示板・投稿・紹介、プロフィールと顔写真、名刺の登録とOCR（tesseract.js）、受け取った紹介、ホーム画面への追加（PWA）、Webプッシュ通知。ホーム画面に追加すれば会員から見ればほぼアプリになる。

ネイティブアプリでしか得られないのは、ML Kitによる高精度な端末内OCRと、iOSでの確実なプッシュ通知。

## フェーズ1: Web公開（ストア不要）

| # | やること | 状態 |
|---|---|---|
| W1 | Webのメール＋6桁コードログイン | 完了 |
| W2 | 有効会員だけを通すAPI境界 | 完了 |
| W3 | 公開サポートページ `/support`、プライバシーポリシー `/privacy` | 完了 |
| W4 | Resend のAPIキーと送信元をSitesの秘密環境変数へ | **未。ここが最優先** |
| W5 | 会員をD1に登録して `active` にする | 未。`docs/member-provisioning.md` |
| W6 | Sites を公開アクセスへ変更 | 未 |
| W7 | 会員へ案内し、ホーム画面への追加を案内する | 未 |

**W4がフェーズ1の関門。** メールが送れないと誰もログインできない。W6まで終われば公開できる。

Webプッシュを使うなら `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` も設定する。未設定でも通知以外は動く。

## フェーズ2: アプリ公開（フェーズ1と並行して待てる）

以下はフェーズ1の間、待っているだけでよい。

- Google Play の本人確認（進行中）。**個人アカウントのため、本番公開前にクローズドテスト期間が課される**
- Apple Developer Program の有効化
- 組織アカウントにするなら D-U-N-S番号の取得

フェーズ1で実際の会員に使ってもらえば、ストア用スクリーンショットも本物の画面で撮れる。

## ゴールから逆算した依存関係（アプリ）


```
両ストアで公開
 └ 審査通過（Apple 1〜3日 / Google 1〜7日、初回は長引く前提）
    └ 提出
       ├ ストアにアプリを作成し、素材・データ申告・審査情報を登録
       │  ├ スクリーンショット（実機から撮る）
       │  ├ ストア文面（サービス名の確定が前提）
       │  └ 審査用アカウント（有効会員 + 固定コード）
       └ production build を作って submit
          ├ Apple Developer Program 有効 ← 登録に日数がかかる
          ├ Google Play Console 有効 ← 登録・本人確認に日数がかかる
          └ 実機確認OK
             ├ iOS preview build ← Apple ID 対話ログインが必要
             ├ Android preview build（済 / APKは2026-09-10まで）
             └ 本番APIが実際に動く
                ├ Resend の APIキーと送信元
                ├ 審査用会員と固定コード
                └ Sites の公開アクセス
```

## リードタイムが長い順に、今すぐ着手するもの

工数ではなく**待ち時間**で並べる。ここが詰まると他が全部止まる。

### 1. Google Play Console の開発者アカウント（最長のリスク）

**個人アカウントで新規に作る場合、本番公開の前にクローズドテストの実施期間が課される**（一定人数のテスターを一定日数）。数週間単位で公開が遅れる要因になるため、最初に確定させる。

**2026-08-28 時点の実際の状態**: `株式会社ColourJam` の名義で登録済みだが、アカウントの種類は**個人用アカウント**。表示名が法人名なだけで、クローズドテスト要件はかかる。本人確認は進行中。

- Web先行にしたため、この待ち時間は公開を止めない
- 要件をなくすには組織アカウントが必要で、そのためにD-U-N-S番号が要る。AppleもOrganizationには同じ番号を求めるので、取得すれば両方に効く
- 要件は変更されるので、**Play Console の最新の案内を必ず確認する**

### 2. Apple Developer Program

- 年額の登録と本人確認。法人名義なら D-U-N-S 番号が必要で、取得・確認に日数がかかる
- 有効化されるまで iOS の production build も提出もできない
- 個人名義なら比較的早い

### 3. APNs / FCM の本番通知資格情報

EAS が iOS の APNs キーを、Android の FCM V1 を扱う。1と2が終わらないと設定できない。

## 現状の判定

```bash
bash scripts/check-release-readiness.sh
```

読み取りだけで何も変更しない。手元のツール、コードの検証、本番APIの境界、アプリ設定、提出用の環境変数を見て、残りを出す。値は表示せず、設定済みかどうかだけを出す。

2026-08-27時点の実測: コードの検証は4項目とも通過。サイトが所有者限定公開のため `/privacy` と `/support` が401で、**このままでは審査に出せない**（レーンAのA4待ち）。

## 進め方（3レーン）

レーンAとBは同時に進む。Cは1・2の完了待ち。

### レーンA: 本人しかできないこと

| # | やること | 前提 | 完了の判定 |
|---|---|---|---|
| A1 | Google Play / Apple の開発者アカウントを確定・登録 | なし。**今すぐ** | 両コンソールにログインでき、アプリを作成できる |
| A2 | Resend のAPIキーと送信元ドメインを用意し、Sitesの秘密環境変数へ設定 | なし。**今すぐ** | 未登録メールで400、登録済みメールで実際にコードが届く |
| A3 | 審査用の有効会員と固定コードを設定 | A2 | 審査用アドレスで固定コードでログインできる |
| A4 | Sites を公開アクセスへ変更 | A3 | 未認証401 / 無効会員403 / 有効会員200 を実機で確認 |
| A5 | Android APK を実機へ入れて主要導線を確認 | A2〜A4 | ログイン、カメラ、複数名刺OCR、顔写真、投稿遷移が動く |
| A6 | iOS preview build を実行し、実機で同じ確認 | A1, A2〜A4 | 同上 |
| A7 | 両実機でプッシュ通知を確認 | A6 | 業種一致の投稿で通知が届き、タップで該当投稿へ飛ぶ |
| A8 | 実機からストア用スクリーンショットを撮る | A5, A6 | `docs/store-screenshot-plan-ja.md` の5枚が両OS分揃う |

A2〜A4の手順は `docs/member-provisioning.md`。

#### A6 のコマンド

Apple ID・パスワード・2段階認証コードを**自分で見えているターミナルに直接入力**する。チャットには貼らない。

```bash
cd <リポジトリ>/mobile
npx eas-cli build --platform ios --profile preview
```

### レーンB: リポジトリ側で先に潰せること

| # | やること | 状態 |
|---|---|---|
| B1 | クリーンなクローンで lint / typecheck / build が通る | 完了 |
| B2 | 有効会員だけを通すAPI境界（Web・アプリ両経路） | 完了 |
| B3 | iOS プライバシーマニフェスト | 完了 |
| B4 | 利用権限が無い会員向けのアプリ内表示と、その状態からのアカウント削除 | 完了 |
| B5 | `eas.json` の submit プロファイル | 完了（値は環境変数で渡す） |
| B6 | サービス名・販売形態を確定し、ストア文面・プライバシー申告を同期 | **未。A1と並行で決める** |
| B7 | 利用権限の運用を決済または管理画面につなぐ | 未。公開後でも可 |

### レーンC: 提出

| # | やること | 前提 |
|---|---|---|
| C1 | App Store Connect / Play Console にアプリを作成 | A1 |
| C2 | ストア文面・素材・スクリーンショットを登録 | A8, B6 |
| C3 | App Privacy / Data safety を申告 | B6 |
| C4 | 審査メモと審査用アカウントを記入 | A3 |
| C5 | production build を作成 | A1, A7 |
| C6 | 両ストアへ提出 | C1〜C5 |
| C7 | 審査指摘に対応 | C6 |
| C8 | 公開後、審査用固定コードを削除し審査会員を停止 | C7 |

#### C5 / C6 のコマンド

```bash
cd <リポジトリ>/mobile

npx eas-cli build --platform ios --profile production
npx eas-cli build --platform android --profile production

# submit の値は eas.json が環境変数から読む
export APPLE_ID='...'                       # Apple ID（パスワードではない）
export ASC_APP_ID='...'                     # App Store Connect のアプリID
export APPLE_TEAM_ID='...'                  # Apple Developer の Team ID
export GOOGLE_SERVICE_ACCOUNT_KEY_PATH='...' # Play Console のサービスアカウント鍵JSONのパス

npx eas-cli submit --platform ios --profile production
npx eas-cli submit --platform android --profile production
```

サービスアカウント鍵のJSONはリポジトリに置かない（`mobile/.gitignore` で `google-service-account*.json` と `play-store-key*.json` を除外済み）。Android は最初 `internal` トラックに `draft` で上げる設定にしてあるので、Play Console で内容を確認してから製品版へ昇格させる。

## ストアに入力する値

| 項目 | 値 | 出典 |
|---|---|---|
| iOS Bundle ID | `jp.everycounts.memberhub` | `mobile/app.config.ts` |
| Android package | `jp.everycounts.memberhub` | 同上 |
| 表示名 | `GIVE HUB`（B6で確定） | `APP_DISPLAY_NAME` |
| バージョン | `1.0.0` | `mobile/app.config.ts` |
| サポートURL | `https://give-hub-shusei.shaw-futamata.chatgpt.site/support` | `app/support/page.tsx` |
| プライバシーポリシー | 同上 `/privacy` | `app/privacy/page.tsx` |
| アカウント削除の案内 | 同上 `/privacy#delete` | 同上 |
| 説明文・キーワード・カテゴリ | `docs/store-listing-ja.md` | |
| 審査メモ | `docs/app-review-notes-ja.md` | |
| App Privacy / Data safety | `docs/privacy-declarations-ja.md` | |

サポートURLとプライバシーポリシーは**審査担当者がログインせずに開ける**必要がある。A4でSitesを公開アクセスへ変更するまでは開けないので、提出前に必ずシークレットウィンドウで確認する。

## 審査で落ちやすい点と、この実装での対応

| 指摘 | 対応 |
|---|---|
| ログインが必要なアプリで審査用アカウントが無い / 使えない | 固定コードの審査専用経路。IP・地域制限なし |
| 会員制アプリなのに登録方法が示されていない | 未登録・権限なしの状態で運営窓口への案内を出す |
| アカウント削除がアプリ内でできない（App Store 5.1.1(v)） | マイページから削除。権限が切れた状態でも削除できる |
| App Privacy の申告と実装が食い違う | `docs/privacy-declarations-ja.md` を提出直前に再監査 |
| required reason API の申告漏れ（ITMS-91053） | `ios.privacyManifests` を設定済み |
| 外部決済への誘導とみなされる（App Store 3.1.1） | アプリ内に価格・購入・決済リンクを置かない。`docs/billing-architecture.md` |
| 端末内OCRなのに写真の用途説明が弱い | 権限文言を用途つきで記載済み。審査メモにも記載 |

## 判断が要るもの

- **Google Play を法人アカウントで登録できるか**（できないならクローズドテスト期間ぶん公開が遅れる）
- **販売形態**: 個人契約か、法人・会場単位契約か。ストア文面と課金設計の記述が変わる
- **サービス名**: 公開後は bundle ID / package を変えられない。表示名は変えられる
