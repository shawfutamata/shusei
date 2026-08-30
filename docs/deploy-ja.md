# 本番にあげる手順

更新: 2026-08-29

`docs/release-runbook-ja.md` が「公開までにどの順で何をやるか」、この文書が **「いまのコードを本番に反映する」その1回ぶんの手順**。

## 本番はどこか

**ChatGPT Sites から切り離し、Cloudflare Workers へ直接出す構成にした（2026-08-29）。** もともと中身はCloudflare Workersで動いていて、Sitesはその上に「D1とR2の用意」と「ログイン用のヘッダ差し込み」を乗せていただけなので、その2つを自前にした。

| | |
|---|---|
| 配信先 | Cloudflare Workers（`wrangler.jsonc` の `name` = `tasuki`） |
| 結線 | D1 `DB` ／ R2 `AVATARS`。**`wrangler.jsonc` 1か所**に書いてあり、手元の開発サーバーもデプロイも同じファイルを読む |
| 独自ドメイン | `tasuki.club`（`app/brand.ts` の `serviceUrl`） |
| ログイン | Googleログインのみ（Web）／Bearerトークン（アプリ）。**ヘッダを信じる経路は無い** |

## はじめの1回だけ

```bash
npm run setup
```

ログイン、D1とR2の作成、`wrangler.jsonc` への `database_id` の書き込み、`AUTH_CODE_PEPPER` の生成と設定までを1本でやる。**すでにあるものは作り直さない**ので、途中で止まってもそのまま流し直せる。

- `wrangler login` はブラウザが開いて本人が承認する。**チャットに貼るものは何も無い**
- `AUTH_CODE_PEPPER` はその場で生成して、そのまま `wrangler secret put` の標準入力へ渡す。**画面にもコマンド履歴にも残らない**
- `database_id` は秘密ではないので、書き込まれたらそのままコミットしてよい

手で順にやる場合はこちら。

```bash
npx wrangler login
npx wrangler d1 create tasuki               # → database_id が出る
npx wrangler r2 bucket create tasuki-avatars
# 出たIDを wrangler.jsonc の REPLACE_WITH_YOUR_D1_DATABASE_ID に貼る
openssl rand -hex 32 | npx wrangler secret put AUTH_CODE_PEPPER
```

`preview_database_id` は触らない。手元の開発サーバー専用の鍵で、本番のIDを入れ替えても手元に溜めたデータが迷子にならないようにしてある。

### 秘密の値を入れる

`vars` には書かない。`secret put` で入れる（値は対話で聞かれる。履歴にも画面にも残らない）。

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put AUTH_CODE_PEPPER          # 適当な長い文字列を1つ決めて固定する
npx wrangler secret put STRIPE_SECRET_KEY
npx wrangler secret put STRIPE_WEBHOOK_SECRET
npx wrangler secret put STRIPE_PRICE_STANDARD
```

| 変数 | 無いとどうなるか | いつ要るか |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **誰もログインできない** | 公開前に必須 |
| `AUTH_CODE_PEPPER` | セッションを作るところで落ちる。**Googleログインも通らない** | 公開前に必須 |
| `STRIPE_SECRET_KEY` | 有料プランも広告も申し込めない | 課金を出すとき |
| （広告に価格IDは要らない） | 金額は日数×単価でその都度変わるので、`price_data` で毎回渡している | — |
| `STRIPE_PRICE_STANDARD` | プラン画面が「準備中」 | 同上 |
| `STRIPE_PRICE_STANDARD_YEAR` | 年払いが出ないだけ（月払いは動く） | 任意 |
| `STRIPE_WEBHOOK_SECRET` | 支払いは通るが**掲載が始まらない**（`active` にならない） | `STRIPE_SECRET_KEY` と同時 |
| `RESEND_API_KEY` / `AUTH_FROM_EMAIL` | 6桁コードのメールが送れない | フェーズ2 |
| `REVIEW_AUTH_EMAIL` / `REVIEW_AUTH_CODE` | 審査担当者がログインできない | ストア提出時 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Webプッシュが出ないだけ | 任意 |

**`AUTH_CODE_PEPPER` を後から変えない。** 変えると、発行ずみのセッションが全部無効になり、会員は次に開いたときログインし直しになる。

**`STRIPE_WEBHOOK_SECRET` を入れ忘れやすい。** 秘密鍵だけ入れると、決済画面までは進めて支払いも通るのに、掲載も有料プランも有効にならない。いちばん気づきにくい壊れ方なので、鍵とセットで入れる。

## GitHubにつないで自動で出す（ターミナルを使わない道）

Cloudflareの管理画面で **Workers & Pages → Create → Connect to Git** からリポジトリをつなぐと、pushのたびに自動でデプロイされる。ターミナルは要らなくなる。

| 設定 | 値 |
|---|---|
| リポジトリ | `shawfutamata/shusei` |
| Worker名 | `tasuki`（**`wrangler.jsonc` の `name` と一致していないとつながらない**） |
| ビルドコマンド | `npm run build` |
| デプロイコマンド | `npx wrangler deploy` |
| 本番ブランチ | デプロイしたいブランチ |

**本番ブランチの指定を間違えると、出したつもりで出ていない。** Cloudflareは本番ブランチ以外では `npx wrangler versions upload`（下書きの保存だけ）を走らせる。既定は `main` なので、別のブランチから出すなら、そのブランチを本番ブランチに設定する。

ビルドで使うNodeは `.node-version` で固定してある。`package.json` の `engines` が22.13以上を求めるので、ここが古いとビルドが落ちる。

秘密の値は **Settings → Variables and Secrets** から入れる（下の表のとおり）。

## 毎回の手順

### 1. あげるコードを確定する

```bash
git fetch origin
git status                       # 変更が残っていないこと
git log --oneline -1
```

**どのブランチをあげるのかを必ず確かめる。** `main` が作業ブランチより遅れていれば、`main` をあげると古い画面が出る。

```bash
git rev-list --count origin/main..origin/<作業ブランチ>
```

0 でなければ `main` は最新ではない。作業ブランチをあげるか、先に取り込む。

### 2. あげる前に落ちないか確かめる

```bash
npm run preflight
```

lint・typecheck・本番ビルド・アプリ側の定数のずれ・`.dev.vars` の混入を見る。ネットワークにも本番にも触らない。**ここが赤いままあげない。**

### 3. 出す

```bash
npm run deploy        # = vinext build && wrangler deploy
```

### 4. 上がったか確かめる

```bash
API=https://tasuki.club     # ドメイン接続前は https://tasuki.<サブドメイン>.workers.dev
for p in / /privacy /support /terms /api/board; do
  printf '%-14s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$API$p")"
done
```

- `/`・`/privacy`・`/support`・`/terms` … **200**（ログイン不要で開ける）
- `/api/board` … **401**（ログインしていないので通らないのが正しい）

手元用のログインが本番で死んでいることも確かめる。

```bash
curl -s "$API/api/dev/signin"     # → {"error":"この経路は開発中のみ使えます。"} で404
```

中身はブラウザでGoogleログインして見る。ログが要るときは `npm run tail`。

## ドメインをつなぐ

1. Cloudflareダッシュボードの Workers → `tasuki` → Settings → Domains & Routes で `tasuki.club` を追加する（ドメインをCloudflareで管理していればDNSは自動）
2. つながったら、ドメインに依存する2つを登録し直す
   - Google … リダイレクトURIに `https://tasuki.club/api/auth/google/callback` を**完全一致**で追加
   - Stripe … Webhookの宛先を `https://tasuki.club/api/billing/webhook` に
3. Stripeの「ブランディング」に `https://tasuki.club/terms` と `/privacy` を設定する

## テーブルの変更（マイグレーション）

**手で流すものは無い。** 本番のテーブルを作るのは `db/data.ts` の `ensureDatabase()` で、APIが呼ばれたときに毎回走る。`CREATE TABLE IF NOT EXISTS` と、PRAGMAで列の有無を見てからの `ALTER TABLE` で組んであるので、何度走っても安全。`db/schema.ts` と `drizzle/` は参照用で、実行時には適用されない。

列を足したときは、**`statements`（CREATE TABLE 群）→ ALTER TABLE → その列を使うインデックス** の順を崩さないこと。順番が逆だと、まだ無い列を指すインデックス作成でバッチごと失敗し、**マイグレーションが1つも走らない**。実際に一度これで止めた。

デプロイ後、初回のAPI呼び出しが少し遅いのはこのため。

## 手元で動かす

Sitesのプラグインが入れてくれていたログインの代わりに、**開発中だけ使えるログイン**を自前で持っている。

```bash
npm run dev
open http://localhost:3000/api/dev/signin
```

`seedy@sites.test`（`local_seedy`）として入る。二重に閉じてある。

1. `import.meta.env.DEV` … 本番ビルドでは `false` に置き換わり、**中身ごと消える**。ビルド後の実体は404を返すだけの3行になる
2. ホスト名がlocalhost … 開発サーバーを外に出していても入られない

手元のD1は `preview_database_id` の側を使うので、本番のIDを入れ替えてもデータは残る。

## 戻したいとき

```bash
npx wrangler deployments list
npx wrangler rollback [<デプロイのID>]
```

**戻せるのはコードだけ。D1のデータは戻らない。** 列を足したあとに戻すと、古いコードが新しいテーブルを読むことになる。列を足しただけなら既定値が入っているので害はないが、意味を変えた場合は戻す前に影響を確かめる。

> **D1は本番が1つしかない。** `npx wrangler d1 execute tasuki --remote` は本番を直接書き換える。`--remote` を付けるときは毎回止まって読み直すこと。

## 会員に見せる前に

Sitesの「所有者限定公開」に当たるものは、Cloudflareには無い。**デプロイした時点で、URLを知っていれば誰でも開ける。** ただし中身は会員だけが見られる（未ログインは401、権限が無ければ403）。公開前に確かめる。

1. Googleログインが本番URLで往復する（`redirect_uri_mismatch` が出ない）
2. 会員をD1で `active` にしてある（`docs/member-provisioning.md`）
3. `/tokushoho` の赤い警告が消えている（`app/company.ts` を埋めた）
4. シークレットウィンドウで `/privacy` と `/support` が開く
