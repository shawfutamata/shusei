# 公開ランブック（Web先行 → アプリ）

更新: 2026-08-28

`docs/release-checklist.md` が「何が終わったか」の一覧、この文書が「どの順で何をやるか」、`docs/deploy-ja.md` が「いまのコードを本番に反映する」その1回ぶんの手順。

## 方針

**Webサービスを先に公開し、アプリはあとから出す。** ストア審査もクローズドテストも待たずに会員へ届けられる。待っている間に開発者アカウントの本人確認が進み、実際の会員のフィードバックでストア文面と機能を固められる。

Web版はアプリとほぼ同じことができる。掲示板・投稿・紹介、プロフィールと顔写真、受け取った紹介、ホーム画面への追加（PWA）、Webプッシュ通知。ホーム画面に追加すれば会員から見ればほぼアプリになる。有料プランの申し込みとトップバナーの出稿はWebだけにある。

ネイティブアプリでしか得られないのは、ML Kitによる高精度な端末内OCRと、iOSでの確実なプッシュ通知。

## フェーズ1: Web公開（ストア不要）

| # | やること | 状態 |
|---|---|---|
| W1 | WebのGoogleログイン | 完了 |
| W2 | 有効会員だけを通すAPI境界 | 完了 |
| W3 | 公開サポートページ `/support`、プライバシーポリシー `/privacy` | 完了 |
| W4 | Google Cloud で OAuth クライアントを作り、Cloudflareのsecretへ | **未。ここが関門** |
| W5 | 会員をD1に登録して `active` にする | 未。`docs/member-provisioning.md` |
| W6 | Cloudflareへデプロイし、tasuki.club をつなぐ（`docs/deploy-ja.md`） | 未 |
| W7 | 会員へ案内し、ホーム画面への追加を案内する | 未 |

**Webのログインは Googleのみ**（2026-08-28に決定）。会員はGoogleアカウントを持っている前提で進める。メール＋6桁コードの画面は `/login` に残してあるが、トップからは案内していない。Googleが使えない会員が出たときは、このURLを個別に案内すれば入れる（ただしそれには Resend の設定が要る）。

### W4 の手順

1. Google Cloud Console でプロジェクトを作る（既存でも可）
2. 「APIとサービス」→「OAuth同意画面」を設定する。ユーザーの種類は外部、スコープは `openid` `email` `profile` の3つ（実装が送っている値と一致させる。`profile` は表示名の取得に使う）
3. 「認証情報」→「OAuth 2.0 クライアント ID」を作る。種類は**ウェブアプリケーション**
4. **承認済みのリダイレクト URI** に次を**完全一致**で登録する

   ```
   https://tasuki.club/api/auth/google/callback
   ```

5. 発行されたクライアントIDとシークレットを、Cloudflareのsecretへ（`npx wrangler secret put`）

   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

独自ドメイン `tasuki.club` を使う。Sitesの配信ドメイン（`*.chatgpt.site`）はそのまま残るので、両方のリダイレクトURIを登録しておくと切り替え中も動く。ここが一致していないとGoogleが `redirect_uri_mismatch` で止める。

### ドメインをつなぐ

1. Sitesのプロジェクト設定でカスタムドメインとして `tasuki.club` を追加し、表示されたDNSレコードをレジストラ側に設定する
2. 証明書が発行され、`https://tasuki.club` が開くようになるのを待つ（反映まで時間がかかることがある）
3. つながったら、ドメインに依存する2つを登録する
   - Stripe … Webhookの宛先を `https://tasuki.club/api/billing/webhook` に
   - Google … リダイレクトURIに `https://tasuki.club/api/auth/google/callback` を追加
4. Stripeダッシュボードの「ブランディング」に、利用規約 `https://tasuki.club/terms` とプライバシーポリシー `https://tasuki.club/privacy` のURLを設定する

コード側の公開URLは `app/brand.ts` の `serviceUrl` 1箇所にある（アプリ側の写しは `mobile/src/constants/brand.ts`）。

Webプッシュを使うなら `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` も設定する。未設定でも通知以外は動く。

Resend（`RESEND_API_KEY` / `AUTH_FROM_EMAIL`）はフェーズ1では不要。アプリはメール認証しか持たないので、**フェーズ2までには必要**になる。

## 画面を実際に見る

デプロイせずに、ローカルで本物を動かして各画面を撮影できる。

```bash
npm run dev                          # 別のターミナルで起動しておく
npm i --no-save playwright-core      # 初回のみ
node scripts/capture-screens.mjs screens
```

ログイン前3枚（トップ / 未登録 / 権限なし）とログイン後4枚（ホーム / 困りごと / 投稿 / マイページ）が出る。会員状態はローカルD1を書き換えて切り替えるので、本番には触れない。ストア用スクリーンショットの下地にも使える。

### 触って確かめるプレビューを作る

静止画では画面の流れが分からない。実際にスクロールしてタップできる1枚のHTMLを作れる。

```bash
npm run dev                                          # 別のターミナルで起動しておく
node scripts/capture-states.mjs preview-states.json  # 本物のアプリを操作して各画面のDOMを保存
node scripts/build-preview.mjs preview-states.json preview.html
```

`capture-states.mjs` はPlaywrightで本物のアプリを開き、下メニュー・絞り込み・投稿カードの詳細・紹介フォーム・16業種の一覧・各モーダルを順に開いて、そのときのDOMとCSSをそのまま保存する。画像は同一オリジンのものだけ data URI に変換して埋め込むので、出来上がったHTMLは1ファイルで完結する。

`build-preview.mjs` はそれをiframeに書き込み、クリックを保存済みの画面に対応付ける。**アプリのHTML・CSS・データは本物、クリックの対応付けだけがこちら側の実装**。文字入力と送信（保存・投稿・紹介）は動かない。サーバーが要るところなので、そこは下の「ステージング環境について」の手順で確かめる。

`npm run dev` は Sites のローカルサインイン（`seedy@sites.test`）で動く。初回は `invited` なので「利用権限がありません」が出る。掲示板を見るにはローカルD1でそのIDを `active` にする。

2026-08-28にこの手順で確認した実測: 未ログインならGoogleログイン画面、ログイン直後は `invited` で掲示板に入れない、`active` にすると掲示板が描画される。**権限ゲートは実際に効いている。**

## ステージング環境について

ローカル撮影では**Googleログインの往復だけは確認できない**。GoogleはリダイレクトURIの完全一致を求めるので、公開URLを持つデプロイ先が要る。

いまのSites本番は所有者限定公開なので、**実質そのままステージングとして使える**。この状態でデプロイしてGoogleログインを自分で通し、問題なければW6で公開アクセスへ切り替える、という順序が最short。別途ステージング用のSitesプロジェクトを立てる必要はない。

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
| A5 | Android APK を実機へ入れて主要導線を確認 | A2〜A4 | ログイン、顔写真、投稿遷移、紹介が動く |
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
| 表示名 | `TASUKI`（B6で確定） | `APP_DISPLAY_NAME` |
| バージョン | `1.0.0` | `mobile/app.config.ts` |
| サポートURL | `https://tasuki.club/support` | `app/support/page.tsx` |
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

## 法務ページ（公開前チェック）

| ページ | 経路 | 状態 |
|---|---|---|
| 利用規約 | `/terms` | 作成済み |
| 返金・キャンセルポリシー | `/refund` | 作成済み |
| 特定商取引法に基づく表記 | `/tokushoho` | **要記入あり** |
| プライバシーポリシー | `/privacy` | 作成済み |

### 公開前に必ずやること

1. **`app/company.ts` を埋める。** 代表者の氏名・所在地・電話番号は、通信販売では省略できない。埋まるまで `/tokushoho` の先頭に赤い警告が出る（本番でも出るので気づける）
2. **適格請求書発行事業者の登録番号**（`invoiceNumber`）を入れる。経営者向けなので、入れると仕入税額控除に使ってもらえる。任意
3. **Stripeの価格を「税込（inclusive）」に設定する。** 表記が税込なので、税抜設定だと請求額と食い違う
4. **専門家のレビューを受ける。** これらは雛形として書いたもので、弁護士の確認は取っていない。特に免責の範囲（第15条）と管轄（第19条）は、事業の実態に合わせて調整すること

### 会員から見える導線

ログイン画面・招待受け取り画面の下、サポートページ、各法務ページの下部に相互リンクを置いてある。Stripeの決済画面からも遡れるよう、Stripeダッシュボードの「ブランディング」に利用規約とプライバシーポリシーのURLを設定しておくこと。

## 会員の声を読む

マイページの「こうしてほしい、を聞かせてください」から届く。運営画面はまだないので、D1を直接見る。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "SELECT f.created_at, f.category, f.body, m.display_name, m.email
             FROM feedback f JOIN members m ON m.id = f.member_id
             WHERE f.status = 'new' ORDER BY f.created_at DESC LIMIT 50"
```

読み終えたものは印を付けておくと、次に見るときに新しいぶんだけ出る。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE feedback SET status = 'read' WHERE id = '<feedbackのid>'"
```

種類は `feature`（ほしい機能）／`usability`（使いにくいところ）／`bug`（うまく動かない）／`other`。1人1日5件までで、本文は1,000文字まで。画像は受け取らない。
