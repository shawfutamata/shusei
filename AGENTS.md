# AGENTS.md — TASUKI 開発の引き継ぎ

最終更新: 2026-10-06

このファイルは **AIエージェント（Codex / Claude など）が最初に読むもの**。
作業を始める前にここを通し読みして、迷ったら「決まりごと」の節に戻る。

---

## 1. これは何か

**TASUKI**（`https://tasuki.club`）は、経営者・事業者どうしが「こんな人を探しています」を
出し合う、**招待制の掲示板**。運営は株式会社ColourJam。

**すでに本番稼働していて、実在の会員が使っている。** 試作ではない。
壊すと人の商売のやり取りが止まる、という前提で触ること。

いまは大きく2つの機能群が同居している。

| | 中身 | 主なコード |
|---|---|---|
| **掲示板（本体）** | 案件の投稿・オファー・メッセージ・広告枠・プラン課金 | `app/BoardClient.tsx`, `db/data.ts` |
| **例会マッチング** | 守成クラブの例会で、当日の名簿＋アンケートからAIが引き合わせ候補を出す | `app/meeting/`, `app/admin/meetings/`, `db/meeting*.ts`, `workers/` |

例会マッチングは2026年9月以降に追加された新しい柱で、`docs/meeting-*.md` に仕様がある。

---

## 2. 技術の地図

| | |
|---|---|
| フレームワーク | Next.js（App Router）を **`vinext`**（Vite）で動かす |
| 実行環境 | **Cloudflare Workers**（`wrangler.jsonc` の `name` = `tasuki`） |
| DB | **Cloudflare D1**（`env.DB`）。SQLite |
| ファイル | **Cloudflare R2**（`env.AVATARS`）。顔写真・案件画像・広告画像・メッセージ画像・バックアップ |
| AI | **Workers AI**（`env.MEETING_AI`）＋ **Queues**（`env.MEETING_ANALYSIS_QUEUE`）。例会マッチングで使う |
| 決済 | **Stripe**（Web専用。アプリからは決済に触れない） |
| メール | **Resend** |
| ログイン | Web = Googleログイン／メール6桁コード。アプリ = Bearerトークン |
| アプリ | `mobile/`（Expo）。**ビルド済みだが未リリース** |

### Workerは3本ある

| ファイル | Worker名 | 役目 |
|---|---|---|
| `wrangler.jsonc` | `tasuki` | 本体（Web・API） |
| `wrangler.meeting-scheduler.jsonc` | `tasuki-meeting-scheduler` | 毎日16:00 UTC に例会を自動準備 |
| `wrangler.meeting-analysis.jsonc` | `tasuki-meeting-analysis` | マッチング分析をQueueで回す |

本体以外を変えたら、**その設定ファイルを指定して個別にデプロイが要る**（`docs/meeting-automation.md`）。

---

## 3. 作業の決まりごと（ここは外さない）

### ブランチ

- 開発は **`claude/codex-chat-handoff-dbw0m2`** で行う。**ここが本番にデプロイされるブランチ。**
- `main` は**古いまま放置されている**（2026-08-28で止まっている）。アプリのコードを `main` へ入れないこと。
- 例外: **GitHub Actions のワークフローだけ `main` にも置いてある**。
  GitHub は定期実行（`schedule`）を**デフォルトブランチのファイルしか登録しない**ため。
  `.github/workflows/*.yml` を変えたら、`main` 側にも同じ内容を置く必要がある。

### push = デプロイ

`claude/codex-chat-handoff-dbw0m2` に push すると **Cloudflare Workers Builds が自動でデプロイする**。
反映まで **おおよそ15分**。つまり **pushは「本番公開」と同義**。壊れたものを push しない。

push の前に必ず:

```bash
npm run lint       # エラー0であること（<img> の警告19件は既知で無視してよい）
npm run typecheck  # 無言で終われば通過
npm run preflight  # 本番へ出す前の総点検（lint・typecheck・build・同期チェック）
```

### 秘密情報

- **`.dev.vars` は絶対にコミットしない。** 手元での検証に使ったら、**コミット前に必ず `rm -f .dev.vars`**。
- APIキー・パスワード・2段階認証コードをチャットに書かせない、表示しない、保存しない。
  本人の入力が要るときだけ、直前に手順を示して待つ。
- 秘密は `npx wrangler secret put <名前>` で入れる。`wrangler.jsonc` には書かない。

### DBのカラムを足すとき

**`db/schema.ts` と `drizzle/` は参照用で、実行時には適用されない。**
本番のテーブルを作っているのは **`db/data.ts` の `ensureDatabase()`** ただ1つ。

- `CREATE TABLE IF NOT EXISTS` ＋ PRAGMAで存在を見てから `ALTER TABLE ADD COLUMN`
- 一度入れたカラム・テーブルは**消さない**（古い行が読めなくなる）
- 既存行に入る既定値を必ず考える。「後から足した列が、昔の行ではどう見えるか」で事故が起きる

### 課金の境界（App Store 3.1.1）

アプリ（`mobile/`）の中に、**購入・価格・プラン変更・Web決済へのリンク・購入を促す文言を置かない。**
契約と決済はWebで完結させ、アプリはサーバーの有効会員判定だけを見る。

### サービス名

サービス名と機能は**まだ変更の可能性がある**。
名前の正は `app/brand.ts`（アプリ側の写しが `mobile/src/constants/brand.ts`）。
ハードコードせず、必ずそこから読む。

---

## 4. 手元で動かす

```bash
npm ci
npm run dev        # http://localhost:3000
```

### ログイン（手元だけ）

```
http://localhost:3000/api/dev/signin?as=local_seedy    # 運営（管理画面に入れる）
http://localhost:3000/api/dev/signin?as=demo-tanaka    # 一般会員
```

この経路は `import.meta.env.DEV` の中にあるので、**本番ビルドでは丸ごと消える**。

### 管理画面を手元で試す

`.dev.vars` に運営のメールアドレスを入れる（**終わったら消す**）。

```
ADMIN_EMAILS="seedy@sites.test"
```

### 手元のD1の実体

```
.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b04….sqlite
```

`sqlite3` コマンドは入っていない。Pythonの `sqlite3` モジュールで読み書きする。

### つまずきやすいところ

- **開発サーバーが起動しない** → `rm -f .vinext/dev/lock.json` してから起動し直す
- **`pkill -f "vinext dev"` が終了コード144を返す** → 異常ではない。他のコマンドと `&&` でつながない
- **`sleep` を連ねて待つのは不可**。`until curl -s -o /dev/null http://localhost:3000/; do sleep 3; done` で待つ
- **日本語を含むファイル編集に `perl -i` を使わない**（黙って何もしないことがある）。Pythonのヒアドキュメントで書き換える
- **CSSは後ろに書いたほうが勝つ。** `app/globals.css` は巨大な1枚で、後半に上書きが積んである。
  直す前に `grep` でその指定が何度出てくるか確かめる

### 画面を実際に見る

Playwrightが入っている（`/opt/pw-browsers/chromium`）。
**見た目を変えたら、憶測で終わらせず実際に描画して確かめること。** この習慣で何度も事故を防いでいる。

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 390, height: 900 } });
// チュートリアルが前に出てくるので黙らせる
await ctx.addInitScript(() => { try { localStorage.setItem('tasuki:tutorial:v1', 'done'); } catch {} });
```

幅は **360 / 390 / 430px** で見る。利用者はほぼスマートフォン。

---

## 5. テスト

```bash
npm run lint
npm run typecheck
npm run preflight          # 本番前の総点検

# 例会まわり（Workerを立てて実際に動かす統合テスト）
node tests/meeting-accounts-runtime.mjs
node tests/meeting-acquisition-runtime.mjs
node tests/meeting-auth-integration.mjs
node tests/meeting-analysis-runtime.mjs
node tests/meeting-platform-runtime.mjs
node tests/cron-runtime.mjs
```

例会のテストは**隔離したD1と、OAuth・メール・AIの差し替え**で動く。
本番のアカウントを作ったり、実際にメールを送ったりはしない。

---

## 6. いま動いている約束ごと（勝手に変えない）

### 開設キャンペーン（`app/campaign.ts`）

**2026年12月31日まで、会費も広告の掲載料も無料。**

- `campaignRunning()` が期間中かどうかを返す。**会費と広告で判定を分けない**（分けると表示が食い違う）
- 期間中は全員がスタンダード相当になる（`app/effective-plan.ts` が読むときに重ねる。DBは書き換えない）
- 広告が無料の間は**ガチャを開かない**（`app/gacha.ts`）。タダの期間に無料券を配っても値打ちが出ないため
- 無料券の期限は**キャンペーン終了日から**数える（期間中は使えないので）

**「有料」と書いたまま実は無料、という食い違いが過去に2回起きている。**
金額に触れる文言を書くときは、必ず `campaignRunning()` / `adsFreeNow()` を通すこと。

### 広告枠（`app/ad-options.ts`, `docs/ad-slots-ja.md`）

| 枠 | 単価（税込） | 枠数 | 業種指定の効き方 |
|---|---|---|---|
| 画面上部のバナー | 350円/日 | 1日10枠 | **並べ替えだけ。全員に出る** |
| 仕事の掲示板の上位 | 600円/日 | 1日3枠 | **絞り込み。その業種の人にだけ出る** |

- 当てる相手は **会員が登録している業種**（`primary_industry` ＋ `notify_industries`）。
  画面でタップしている絞り込みではない（そちらで当てると、ほぼ誰にも出なくなる）
- **表示回数で値段を変えない。** 同じ枠に入った人は同じだけ回る

### メール（通数がそのまま費用になる）

Resendの無料枠は **1日100通・月3,000通**。有料でも月$20で5万通。
**ここだけが会員数に比例して効いてくる。** Cloudflare側（D1・R2・Workers）は1,000人規模でも月$5のまま。

いま送っているもの:

| きっかけ | 送り方 |
|---|---|
| メッセージが届いた | 1通ごとに即送信（`sendMessageMail`） |
| 業種の合う案件が投稿された | 投稿ごとに**最大200人**へ（`REQUEST_MAIL_LIMIT`） |
| オファーが届いた | **その日の1件目だけ即送信。2件目以降は21:00にまとめて1通**（`sendPendingOfferDigest`） |

**既知の問題**: 業種通知の200人打ち切りに**並び順の指定がない**。
実質「先に登録した200人だけが、ずっと受け取る」状態。会員が200人を超えたら、
201人目以降には一通も届かない。**まとめ送り（1日1通のダイジェスト）に変えるのが本筋。**

### 定期実行（GitHub Actions）

| ワークフロー | 時刻（JST） | 中身 |
|---|---|---|
| `backup.yml` | 毎日 03:00 | 本番データをR2へ書き出す |
| `offer-digest.yml` | 毎日 21:00 | その日の2件目以降のオファーをまとめて知らせる |

どちらも `BACKUP_TOKEN`（Cloudflare Secret ＋ GitHub Secret に同じ値）で認証する。
**この2つのYAMLは `main` にも置いてある**（理由は「決まりごと」の節）。

---

## 7. 画面の作り方（この場の作法）

利用者は **守成クラブの経営者で、年配の方が多い。**
一般的なスマホアプリの作法を「知っている前提」で作らない。

- **記号だけのボタンを置かない。** アイコンには必ず名前を添える
  （下のメニュー5つ、右上の「案件を探す」はこの理由で文字つきにした）
- **押しても何も起きないものを並べない。** できないことを探させるだけ
- **取り消せない操作は、必ず一度確かめる。** 何が一緒に消えるかを先に書く
- **数字は「何の数字か」を言葉で添える。**「＋2」のような記号と数の塊は読めない
- 文言は**その行だけ読んで意味が通るか**で判断する
- コメントは**なぜそうしたか**を日本語で書く。既存のコードがその書き方になっている

---

## 8. 残っている作業

### すぐ効くもの

- [ ] **ロゴの差し替え。** 本人から新しいロゴ画像を受領待ち。
      いまの `public/mark.svg` は紺＋水色の2色。新しいものは**左右の中央にオレンジの継ぎ目**が入る。
      差し替え先は `public/mark.svg` 1つで、ヘッダー・ログイン・管理画面・LP・アプリアイコンの5か所に効く
- [ ] **R2のライフサイクル設定（未実施）。** バケット `tasuki-avatars`、プレフィックス `message-images/`、
      30日で削除。**入れないとメッセージ画像が溜まり続ける**
- [ ] **業種通知メールのまとめ送り化。** 上の「既知の問題」。会員200人を超える前に

### 運用側（本人の操作が要る）

- [ ] お名前.comの登録者メールアドレスを、普段見る受信箱に揃える
      （2026年8月にICANNの確認メールを見落として `client hold` になり、ドメインが半日止まった。次の更新期は2027/08/29）
- [ ] `info@tasuki.club` のメールボックス作成
- [ ] `company.invoiceNumber`（適格請求書発行事業者番号）の記入
- [ ] Stripe Billing Portal の解約引き留め設定
- [ ] `STRIPE_PRICE_STANDARD` / `STRIPE_PRICE_STANDARD_YEAR` の値の確認

### 判断待ち

- [ ] バナーの業種による出し分け。**枠が埋まる日が出てから**。
      絞り込みは「売れる枠を増やす仕組み」なので、埋まり始めたら作る価値が出る
- [ ] LINE連携（代理投稿の受付）。返信APIは無料なので、受けて返すだけなら費用はかからない。
      Push（こちらから送る）は従量
- [ ] アプリのストア公開。Google Playは `株式会社ColourJam` 名義だが**個人用アカウント**のため、
      本番公開前にクローズドテスト期間が課される

---

## 9. 読むべき資料

| 用途 | ファイル |
|---|---|
| 公開までの順序 | `docs/release-runbook-ja.md` |
| **本番へ出す手順** | `docs/deploy-ja.md` |
| 例会マッチングの運用 | `docs/meeting-platform.md` |
| 例会の自動準備 | `docs/meeting-automation.md` |
| 例会アンケートの仕様 | `docs/meeting-survey.md` |
| イベント経由の会員獲得 | `docs/meeting-acquisition.md` |
| 広告枠 | `docs/ad-slots-ja.md` |
| 無料券ガチャ | `docs/ad-gacha-ja.md` |
| ランク特典 | `docs/rank-perks-ja.md` |
| プラン・料金 | `docs/pricing-plan-ja.md` |
| 管理画面 | `docs/admin-ja.md` |
| バックアップと復旧 | `docs/backup-ja.md` |
| 課金の設計（App Store対応） | `docs/billing-architecture.md` |
| 言葉づかい | `docs/wording-ja.md` |

`CLAUDE_HANDOFF.md` は2026年8月（公開前）の記録で、**いまの状態とは合わない部分がある**。
歴史として読むのはよいが、現状の根拠には使わないこと。

---

## 10. 事故の記録（同じことを繰り返さないために）

| 起きたこと | 原因 | 学び |
|---|---|---|
| ドメインが半日止まった | ICANNの登録者確認メールを見落とし `client hold` | サーバーを疑う前に `RDAP` でドメインの状態を見る |
| 「有料」と書いたまま、実は無料で使えていた | 文言を固定で書き、キャンペーンの判定を通していなかった | 金額の文言は必ず `campaignRunning()` を通す |
| バックアップが一度も動いていなかった | ワークフローが開発ブランチにしかなく、GitHubが定期実行を登録していなかった | `schedule` はデフォルトブランチのファイルしか見ない |
| 写真がアップロードできず登録が進まなかった | 元ファイルの大きさと種類で弾いていた | 端末で縮めてから送るので、選ぶ時点では「読めるか」だけ見る |
| サムネイルの見出しが切れていた | 枠と画像の縦横比が違うのに `object-fit: cover` だった | 枠を画像と同じ比率にする。収まらないものは切らずに余白 |
| 業種を指定した広告がほぼ表示されなかった | 当て先を「画面でタップした絞り込み」にしていた | 当て先は**登録してある業種**。絞り込みは大半の人が触らない |

---

## 11. コミットの作法

- **メッセージは日本語。** 1行目に何をしたか、本文に**なぜそうしたか**と、確かめた内容
- 既存のコミットを `git log` で何本か読んでから書く。その温度に合わせる
- 末尾に以下を付ける（モデル名は、そのとき動いているものに合わせる）

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MWcWZbT7Kqcwm12uJEzVyT
```

- **push前に `rm -f .dev.vars`**
- push前に `git fetch` して、他のエージェントの作業と衝突していないか見る
  （このブランチは複数のエージェントが触っている）
