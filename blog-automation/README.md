# semon ブログ自動化

株式会社SEMONのWixブログに、毎週1本の記事を自動で作って公開する仕組み。
目的は「マスターv4」での検索順位1位の維持。

## 何が自動になって、何がならないか

自動になること:

- Search Consoleの実績取得（直近28日 vs その前の28日）
- 今週どの記事を書くべきかの判断（1位を守る記事か、次の順位を取りにいく記事か）
- 構成案と本文の執筆（Claude API）
- アイキャッチ画像の生成（OpenAI API）
- 薬機法・景表法の危険表現チェックと、引っかかった場合の書き直し
- Wixブログへの投稿と公開
- 週次レポート（順位の推移、落ちたクエリ、タイトルを直すべきクエリ）

自動にならないこと（正直に）:

- **検索順位1位そのものは保証できない。** 順位を決めるのはGoogleで、競合が動けば落ちる。
  この仕組みができるのは「落ちたことを毎週検知して、取り返す記事を自動で出す」ところまで。
- **薬機法の最終判断。** チェッカーは明らかな事故を止める網であって、通過＝適法ではない。
  マスターV4は管理医療機器なので、広告表現の責任は御社に残る。
- **事実確認。** 生成AIは事実を間違える。金額・日程・仕様は人が見る前提で運用すること。

## なぜ画面の自動操作ではなくAPIなのか

- ChatGPTとClaudeは、画面の自動操作を利用規約で禁止している。APIが正規の無人実行手段。
- 画面操作にはIDとパスワードを機械に預ける必要がある。APIキーより危険で、
  2段階認証とbot検知で毎週止まる。
- Wixの管理画面はUIが変わる。画面操作の自動化は変更のたびに壊れる。

## 準備するもの

`.env` ではなく GitHub の Secrets に入れる（Settings → Secrets and variables → Actions）。

| Secret名 | 取得先 | 用途 |
|---|---|---|
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Google Cloud Console でサービスアカウントを作成 → キーをJSONで発行 → **そのJSONの中身をまるごと貼る**。さらにそのサービスアカウントのメールアドレスを Search Console の「設定 → ユーザーと権限」に「制限付き」で追加する | 順位・表示回数の取得 |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys | 記事本文の生成 |
| `OPENAI_API_KEY` | platform.openai.com → API keys | アイキャッチ画像の生成 |
| `WIX_API_KEY` | Wix管理画面 → 設定 → APIキーマネージャー（Blogの読み書きとMediaの権限を付ける） | Wixへの投稿 |
| `WIX_SITE_ID` | Wix管理画面のサイト設定、またはAPIキー発行時に表示される | 投稿先サイトの指定 |
| `WIX_ACCOUNT_ID` | 同上（アカウント単位のAPIキーを使う場合のみ必要） | 認証 |
| `WIX_MEMBER_ID` | 投稿の著者にしたいWixメンバーのID | 記事の著者 |

概算コスト: 記事1本あたり Claude が数十円〜200円程度、画像が20〜40円程度。
週1本なら月1,000円前後。Search ConsoleのAPIは無料。

## 最初にやること（これをやらないと公開されない）

`config.json` の `product` を、マスターV4の**医療機器認証書に書かれているとおり**に埋める。

```json
"product": {
  "name": "マスターV4",
  "regulatoryClass": "管理医療機器",
  "certificationNumber": "（認証番号）",
  "approvedEfficacy": "（認証を受けた効能・効果の文言をそのまま）",
  "generalName": "（一般的名称）"
}
```

`approvedEfficacy` が空のあいだは、**何を書いてよいかを機械が判定できない**ので
自動公開は行われず、記事は `output/` に保存されるだけになる。これは意図的な安全装置。

`config.json` の `site.gscSiteUrl` も、Search Consoleに登録されている形式に合わせる
（ドメインプロパティなら `sc-domain:semon-inc.com`、URLプレフィックスなら `https://www.semon-inc.com/`）。

## 使い方

```bash
# 外部APIを呼ばない自己テスト
node blog-automation/src/selftest.mjs

# 生成だけして中身を見る（公開しない）
node blog-automation/src/run-weekly.mjs --dry-run

# Search ConsoleのAPIを使わず、画面からダウンロードしたCSVで分析する
node blog-automation/src/run-weekly.mjs --csv=クエリ.csv --dry-run

# 本番。生成して公開まで
node blog-automation/src/run-weekly.mjs
```

生成物は `blog-automation/output/YYYY-MM-DD-スラッグ/` に残る（Gitには含めない）。
`article.md` `eyecatch.png` `report.md` `analysis.json` が入る。

自動実行は `.github/workflows/blog-weekly.yml`。毎週火曜10:00 JST。
GitHubのActionsタブから手動実行もできる（初回は dry run のまま実行すること）。

## 立ち上げの順番

1. `config.json` の `product` と `site.gscSiteUrl` を埋める
2. Secretsを登録する
3. Actionsタブから **dry run で手動実行**し、`blog-output` アーティファクトの記事を読む
4. 記事の質と表現に納得したら、Wixへ1本だけ手動実行で公開して見た目を確認する
   （WixのAPI疎通はまだ実アカウントで検証していないので、ここで一度は目視が要る）
5. 問題なければ週次スケジュールに任せる。毎週 `report.md` だけ見ればよい

## 運用で見るところ

毎週のレポートで、順位そのものより先に次を見る。

- **順位が落ちたクエリ** … 翌週の記事が自動でここを取りにいく
- **順位は良いのにクリックされていないクエリ** … 記事を増やしても解決しない。
  既存記事のタイトルとdescriptionを直す仕事なので、人が対応する
- **薬機法チェックの指摘** … 指摘が続くなら `config.json` の `approvedEfficacy` か
  `editorial.tone` の書き方に原因がある
