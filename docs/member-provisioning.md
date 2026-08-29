# 会員の登録と利用権限の運用

アプリ・Webの利用権限は `members.membership_status` だけで決まります。管理画面はまだないため、当面はD1へ直接SQLを実行して運用します。

## 状態の意味

| status | 利用可否 | 用途 |
|---|---|---|
| `active` | 可 | 登録した人。**既定値** |
| `past_due` | `membership_period_end` が未来なら可 | 支払い遅延中の猶予期間 |
| `suspended` | 不可 | 運営が利用を止めた人 |
| `canceled` | 不可 | 退会した人 |
| `invited` | 不可 | 旧・承認待ち。**もう作られない**（既存の行は自動で `active` に移行済み） |

Webのログインは Googleアカウントで行います。**会員の `email` と、ログインに使うGoogleアカウントのメールアドレスが一致している必要があります。** 一致しないと「登録されていません」として弾かれます。

**登録した人はその場で使えます。** 承認待ちはありません。新しく作成される `members` の行は `active` で始まり、`activated_at` にその日時が入ります（紹介の30日はここから数えます）。

利用を止めるときは `suspended` にします。`invited` はもう使いません。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE members SET membership_status = 'suspended' WHERE email = 'member@example.jp'"
```

## 前提

- D1のデータベース名はCloudflareダッシュボード、またはSitesプロジェクトのバインディング設定（`.openai/hosting.json` の `d1` が指すバインディング `DB`）から確認します。
- 以下では `<D1_DATABASE>` をその名前に置き換えます。
- 本番へ実行するときだけ `--remote` を付けます。

## 会員を有効化する

初回ログイン後、その人の行は `invited` として存在します。メールアドレスで確認します。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "SELECT id, email, display_name, membership_status FROM members ORDER BY created_at DESC LIMIT 20"
```

該当のメールアドレスを有効化します。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE members SET membership_status = 'active', membership_source = 'direct_contract' WHERE email = 'member@example.jp'"
```

法人・会場単位の契約でまとめる場合は `membership_source = 'organization_contract'` と `organization_id` を併せて設定します。

## 会員を停止する

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE members SET membership_status = 'canceled' WHERE email = 'member@example.jp'"
```

停止しても既存のBearerセッションは次のAPI呼び出しで無効になります（`getMobileSessionAccess` が毎回 `membership_status` を見ます）。すぐに切りたい場合はセッションも削除します。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "DELETE FROM mobile_sessions WHERE member_id = (SELECT id FROM members WHERE email = 'member@example.jp')"
```

## ストア審査用アカウント

審査担当者はメールを受け取れないため、指定した1アドレスだけ固定コードでログインできる経路を用意しています（`configuredReviewCode`）。

**順序を守ること。** `requestMobileAuthCode` は登録済みかつ有効な会員でなければ400で拒否するので、行が先、ログインが後になる。「アプリでログインして行を作る」はできない。

1. 行を直接作る。`<REVIEW_EMAIL>` は審査用アドレス。

   ```bash
   npx wrangler d1 execute <D1_DATABASE> --remote \
     --command "INSERT INTO members (id, email, display_name, membership_status, created_at) VALUES ('store-review', '<REVIEW_EMAIL>', '審査用アカウント', 'active', '2026-08-28T00:00:00.000Z')"
   ```

2. Sitesの**秘密**環境変数に `REVIEW_AUTH_EMAIL` と `REVIEW_AUTH_CODE` を設定する（下記）。

3. アプリ（Android preview APK で可）から `<REVIEW_EMAIL>` と固定コードでログインする。この経路はメールを送らないので、Resendが未設定でも通る。

4. **アプリのマイページからプロフィールを埋める。** 顔写真は必須で、無いと投稿できず審査手順の4番目で詰まる。会社名・所属会場・業種も入れる。写真のアップロードはアプリからしかできないため、SQLでは代替できない。

5. 審査担当者が見る中身を用意する。サンプルの探しごとを1件投稿し、可能なら別の会員から紹介を1件付けておく。空の画面だけ見せると「機能が動作しない」と判断されることがある。

環境変数は次のとおり。値はチャットやGitに残さない。
- `REVIEW_AUTH_EMAIL`: 審査用メールアドレス
- `REVIEW_AUTH_CODE`: 6桁の数字

両ストアの公開が確認できたら、`REVIEW_AUTH_CODE` と `REVIEW_AUTH_EMAIL` を削除し、審査用会員を `canceled` にする。

固定コードが設定されている間、そのアドレスへは認証メールを送りません。他のアドレスは通常どおりResend経由のメールになります。

## 必要な環境変数

| 変数 | 用途 | 未設定のときの挙動 |
|---|---|---|
| `AUTH_CODE_PEPPER` | 認証コードとセッショントークンのハッシュに使用 | すべてのログインが失敗 |
| `RESEND_API_KEY` | 認証メール送信 | 通常会員のコード送信が400で失敗 |
| `AUTH_FROM_EMAIL` | 認証メールの送信元 | 同上 |
| `REVIEW_AUTH_EMAIL` / `REVIEW_AUTH_CODE` | 審査用の固定コード | 審査用経路が無効（通常のメール認証のみ） |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | WebのGoogleログイン | Webのログインボタンが使えない |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | WebプッシュのVAPID鍵 | Webプッシュが無効。アプリのExpo Pushには影響しない |

## 招待リンクから来た人

会員の招待リンク（`/join/<コード>`）から登録した人も、`membership_status = 'invited'` で作られます。**招待だけでは利用権限は付きません。** 誰の紹介かは `invited_by` に入ります。承認の手順と、紹介した人への無料月の扱いは `docs/referral-program-ja.md` を見てください。

## 会場一覧の正 (source of truth)

プロフィールの所属会場は、都道府県 → 会場の2段階で選ぶ。一覧は `app/venue-options.ts`。
2026-08-28時点で、本部サイト（shusei-honbu.jp）の全国会場案内を主に、shusei-soushin.com と
shusei-iwamizawa.com の一覧で補って作った。**会場は新設・統合・改称があるので、公開前に本部の
一覧と必ず突き合わせること。 収録は45都道府県・336会場だが、公開情報で
確認できる会場数は243〜300程度なので、閉場・改称ぶんが混ざっている前提で確認すること。** 一覧に無い会場は「その他（自由入力）」から登録できるので、
多少の抜けがあっても会員は登録できる。

アプリ側の `mobile/src/constants/venues.ts` は自動生成。編集しないこと。

```bash
npm run sync:venues    # app/venue-options.ts から書き出す
npm run check:venues   # ずれていたら失敗する（CIでも実行）
```

## スキーマの正 (source of truth)

本番のテーブル定義は `db/data.ts` の `ensureDatabase()`（`CREATE TABLE IF NOT EXISTS` と不足カラムの `ALTER TABLE`）が作ります。`db/schema.ts` と `drizzle/` は型と参照用で、実行時には適用されません。カラムを追加するときは `ensureDatabase()` 側も必ず更新します。

既存のデータベースでは `membership_status` のカラム既定値は作成当時の `'active'` のままです。新規行が `invited` になるのは、`upsertMember` が値を明示的に入れているためです。
