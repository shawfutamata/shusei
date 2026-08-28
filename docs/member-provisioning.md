# 会員の登録と利用権限の運用

アプリ・Webの利用権限は `members.membership_status` だけで決まります。管理画面はまだないため、当面はD1へ直接SQLを実行して運用します。

## 状態の意味

| status | 利用可否 | 用途 |
|---|---|---|
| `invited` | 不可 | 初回ログインで自動作成された未承認の行。既定値 |
| `active` | 可 | 契約中の会員 |
| `past_due` | `membership_period_end` が未来なら可 | 支払い遅延中の猶予期間 |
| `canceled` | 不可 | 解約済み |

新しく作成される `members` の行は必ず `invited` で始まります。運営が明示的に `active` へ更新するまで、Web掲示板もアプリも利用できません。ChatGPTログインだけで会員扱いになることはありません。

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

停止しても既存のBearerセッションは次のAPI呼び出しで無効になります（`getMobileSessionUser` が毎回 `membership_status` を見ます）。すぐに切りたい場合はセッションも削除します。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "DELETE FROM mobile_sessions WHERE member_id = (SELECT id FROM members WHERE email = 'member@example.jp')"
```

## ストア審査用アカウント

審査担当者はメールを受け取れないため、指定した1アドレスだけ固定コードでログインできる経路を用意しています（`configuredReviewCode`）。

1. 審査用メールアドレスでアプリまたはWebに1度ログインし、`members` に行を作ります。作れない場合は運営が直接INSERTします。
2. その行を `active` にし、顔写真・会社・会場・業種を登録します（顔写真がないと投稿できません）。
3. Sitesの**秘密**環境変数に次を設定します。値はチャットやGitに残しません。
   - `REVIEW_AUTH_EMAIL`: 審査用メールアドレス
   - `REVIEW_AUTH_CODE`: 6桁の数字
4. 両ストアの公開が確認できたら、`REVIEW_AUTH_CODE` と `REVIEW_AUTH_EMAIL` を削除し、審査用会員を `canceled` にします。

固定コードが設定されている間、そのアドレスへは認証メールを送りません。他のアドレスは通常どおりResend経由のメールになります。

## 必要な環境変数

| 変数 | 用途 | 未設定のときの挙動 |
|---|---|---|
| `AUTH_CODE_PEPPER` | 認証コードとセッショントークンのハッシュに使用 | すべてのログインが失敗 |
| `RESEND_API_KEY` | 認証メール送信 | 通常会員のコード送信が400で失敗 |
| `AUTH_FROM_EMAIL` | 認証メールの送信元 | 同上 |
| `REVIEW_AUTH_EMAIL` / `REVIEW_AUTH_CODE` | 審査用の固定コード | 審査用経路が無効（通常のメール認証のみ） |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | WebプッシュのVAPID鍵 | Webプッシュが無効。アプリのExpo Pushには影響しない |

## スキーマの正 (source of truth)

本番のテーブル定義は `db/data.ts` の `ensureDatabase()`（`CREATE TABLE IF NOT EXISTS` と不足カラムの `ALTER TABLE`）が作ります。`db/schema.ts` と `drizzle/` は型と参照用で、実行時には適用されません。カラムを追加するときは `ensureDatabase()` 側も必ず更新します。

既存のデータベースでは `membership_status` のカラム既定値は作成当時の `'active'` のままです。新規行が `invited` になるのは、`upsertMember` が値を明示的に入れているためです。
