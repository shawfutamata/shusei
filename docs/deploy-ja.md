# 本番にあげる手順

更新: 2026-08-29

`docs/release-runbook-ja.md` が「公開までにどの順で何をやるか」、この文書が **「いまのコードを本番に反映する」その1回ぶんの手順**。

## 本番はどこか

| | |
|---|---|
| 配信先 | OpenAI Sites プロジェクト `appgprj_6a8fb64aab7481919cd98546db4a2a06`（`.openai/hosting.json`） |
| 現URL | `https://give-hub-shusei.shaw-futamata.chatgpt.site` |
| 独自ドメイン | `tasuki.club`（`app/brand.ts` の `serviceUrl`。DNS未接続） |
| データ | Cloudflare D1 `DB` ／ R2 `AVATARS`。**Sitesプロジェクトに紐づく本番の1つだけ**。ステージング用は無い |
| 公開範囲 | 所有者限定。2026-08-29に確認: `/`・`/privacy`・`/api/ads` すべて **401** |

所有者限定なので、**このままステージングとして使える**。デプロイしても会員には見えない。

> **D1は本番が1つしかない。** ローカルの `.wrangler/` は別物だが、`npx wrangler d1 execute --remote` は本番を直接書き換える。`--remote` を付けるときは毎回止まって読み直すこと。

## 毎回の手順

### 1. あげるコードを確定する

```bash
git fetch origin
git status                       # 変更が残っていないこと
git log --oneline -1             # あげようとしている先頭コミット
```

**どのブランチをあげるのかを必ず確かめる。** 2026-08-29時点で `main` は作業ブランチより45コミット遅れており、`main` をあげると名刺廃止前の古い画面が出る。

```bash
git rev-list --count origin/main..origin/claude/codex-chat-handoff-dbw0m2
```

0 でなければ、`main` は最新ではない。作業ブランチをあげるか、先に取り込む。

```bash
# 取り込む場合（早送りで入るなら衝突しない）
git checkout main && git merge --ff-only origin/claude/codex-chat-handoff-dbw0m2 && git push origin main
```

### 2. あげる前に落ちないか確かめる

```bash
bash scripts/preflight-deploy.sh
```

lint・typecheck・本番ビルド・アプリ側の定数のずれを見る。ネットワークも本番も触らない。**ここが赤いままあげない。** ビルドが通らないコードをSitesへ送ると、前の版が生きたままデプロイだけが失敗する（＝気づきにくい）。

### 3. Sitesへ送る

Sitesはgitのリモートとしてつながっている。リモート名は環境によるので確かめる。

```bash
git remote -v
```

`origin`（GitHub）以外に出てくるのがSites用。仮に `sites` なら:

```bash
git push sites HEAD:main
```

`origin` しか出てこない場合、そのマシンにSitesのリモートが設定されていない。ChatGPTのSitesプロジェクト画面から接続情報を取り直す。**接続文字列をチャットに貼らない。**

### 4. 上がったか確かめる

```bash
API=https://give-hub-shusei.shaw-futamata.chatgpt.site
for p in / /privacy /support /terms /api/ads; do
  printf '%-14s %s\n' "$p" "$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "$API$p")"
done
```

所有者限定公開のあいだは **全部401が正常**。中身はブラウザでログインして見る。

見るべきは、そのデプロイで変えたところ。広告まわりを変えたなら:

- 下メニューの「広告」→ モーダルが開く
- ランクが足りなければ「RUBYランク以上の会員さまに〜」が出る（出稿の手順に入れない）
- 足りていれば ①掲載内容 → ②掲載期間 → ③ご確認 の3手順。②で掲載日数のバーを動かすと、掲載期間とカレンダーの塗りが一緒に変わる

## 初回だけ必要な設定（Sitesの秘密環境変数）

コードが読む環境変数は次で全部。**Sitesのプロジェクト設定画面で本人が入力する。チャットに貼らない。**

| 変数 | 無いとどうなるか | いつ要るか |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **誰もログインできない** | 公開前に必須 |
| `STRIPE_SECRET_KEY` | 有料プランも広告も申し込めない | 課金を出すとき |
| `STRIPE_PRICE_STANDARD` | プラン画面が「準備中」 | 同上 |
| `STRIPE_PRICE_STANDARD_YEAR` | 年払いが出ないだけ（月払いは動く） | 任意 |
| `STRIPE_PRICE_AD_SLOT` | 広告が **「広告の受け付けは準備中です」** で止まる | 広告を売るとき |
| `STRIPE_WEBHOOK_SECRET` | 支払いは通るが**掲載が始まらない**（`active` にならない） | `STRIPE_SECRET_KEY` と同時 |
| `AUTH_CODE_PEPPER` | アプリのメール認証が例外で落ちる | フェーズ2 |
| `RESEND_API_KEY` / `AUTH_FROM_EMAIL` | 6桁コードのメールが送れない | フェーズ2 |
| `REVIEW_AUTH_EMAIL` / `REVIEW_AUTH_CODE` | 審査担当者がログインできない | ストア提出時 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Webプッシュが出ないだけ | 任意 |

`DB` と `AVATARS` はSitesが自動で結線する（`.openai/hosting.json`）。手で設定しない。

**`STRIPE_WEBHOOK_SECRET` を入れ忘れやすい。** 秘密鍵だけ入れると、決済画面までは進めて支払いも通るのに、掲載も有料プランも有効にならない。いちばん気づきにくい壊れ方なので、鍵とセットで入れる。

## テーブルの変更（マイグレーション）

**手で流すものは無い。** 本番のテーブルを作るのは `db/data.ts` の `ensureDatabase()` で、APIが呼ばれたときに毎回走る。`CREATE TABLE IF NOT EXISTS` と、PRAGMAで列の有無を見てからの `ALTER TABLE` で組んであるので、何度走っても安全。`db/schema.ts` と `drizzle/` は参照用で、実行時には適用されない。

列を足したときは、**`statements`（CREATE TABLE 群）→ ALTER TABLE → その列を使うインデックス** の順を崩さないこと。順番が逆だと、まだ無い列を指すインデックス作成でバッチごと失敗し、**マイグレーションが1つも走らない**。実際に一度これで止めた。

デプロイ後、初回のAPI呼び出しが少し遅いのはこのため。

## 戻したいとき

Sitesはバージョンを保持しているので、**プロジェクト画面から前の版に戻すのがいちばん速い**。gitを巻き戻して押し直すより確実。

ただし、**戻せるのはコードだけ。D1のデータは戻らない。** 列を足したあとに戻すと、古いコードが新しいテーブルを読むことになる。列を足しただけなら既定値が入っているので害はないが、意味を変えた場合は戻す前に影響を確かめる。

## 公開範囲を変える（会員に見せる）

所有者限定 → 公開アクセスへの切り替えは、Sitesのプロジェクト設定で行う。**これをやると誰でも開ける。** 順序は `docs/release-runbook-ja.md` のW4〜W7。切り替え前に:

1. Googleログインが本番URLで往復する（`redirect_uri_mismatch` が出ない）
2. 会員をD1で `active` にしてある（`docs/member-provisioning.md`）
3. `/tokushoho` の赤い警告が消えている（`app/company.ts` を埋めた）
4. シークレットウィンドウで `/privacy` と `/support` が開く

を確かめる。1つでも欠けると、開いた瞬間に会員が入れない・法令表示が欠けた状態で見られる。
