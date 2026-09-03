# データの控えと、戻し方

会員の名簿、案件、オファーのやり取り、お支払いの記録。**一度消えると
元に戻せないもの**をお預かりしています。守りは3枚重ねです。

| | どこにある | どこまで戻せる | 誰が用意する |
|---|---|---|---|
| 1. Time Travel | Cloudflare（D1の機能） | 直近30日の**どの瞬間にも** | 自動。設定はいりません |
| 2. 毎日の写し | Cloudflare R2（`backups/`） | 日ごと30日＋月初1年 | 毎日03:00（日本時間）に自動 |
| 3. 手元の控え | ショウさんのパソコン等 | 落とした時点 | **月にいちど、手で落とす** |

3枚目だけは手作業です。1と2はどちらもCloudflareの中にあるので、
**アカウントそのものを失う事故には、手元の控えしか効きません。**

---

## ふだんの見かた

管理画面（<https://tasuki.club/admin>）の左の「バックアップ」。

- 置いてある控えの一覧と、それぞれの大きさ・取った時刻
- 「いますぐ控えを取る」… その場でもう1本取ります
- 「いまの中身をダウンロード」… R2を経由せず、そのまま手元へ落とします

月にいちど、この「ダウンロード」を押して、パソコンかご自身のクラウド
（Google Driveなど）に置いてください。それが3枚目です。

## 毎日の自動実行

GitHub Actions の `Backup` が、毎日18:00 UTC（日本時間の翌03:00）に
`POST https://tasuki.club/api/admin/backup` を叩きます。運ぶのは合図だけで、
書き出しも保存もCloudflareの中で終わります（**名簿がGitHubを通りません**）。

動かすのに要るもの：

1. 本番に合言葉を入れる
   ```
   npx wrangler secret put BACKUP_TOKEN
   ```
2. GitHubの `Settings → Secrets and variables → Actions` に、
   **同じ文字列**を `BACKUP_TOKEN` という名前で入れる

合言葉を入れていなければ、この道は開きません（管理画面からは今までどおり
取れます）。失敗した回はGitHubの実行が赤くなるので、**取れていないことに
気づけます。**

## 控えに入らないもの

- **ログイン中の合鍵**（`mobile_sessions` / `mobile_auth_codes`）…
  控えを1本手に入れた人が全員になりすませてしまうため、写しません。
  戻したあとは、みなさんに入り直していただきます。
- **写真・動画**… R2に置いてあり、D1には入っていません。控えは文字だけです。
  （写真はR2ごと消えないかぎり残ります）

---

## 戻し方

### 「さっき誰かが消してしまった」— まず Time Travel

いちばん速くて確実です。直近30日なら、秒単位で戻せます。

```bash
# どこまで戻れるか
npx wrangler d1 time-travel info tasuki --remote

# 試しに、戻す先を決めて中身を確かめる（まだ変わりません）
npx wrangler d1 time-travel restore tasuki --timestamp=2026-09-01T09:00:00Z --dry-run

# 本当に戻す
npx wrangler d1 time-travel restore tasuki --timestamp=2026-09-01T09:00:00Z
```

**戻すと、その時刻より後の書き込みは全部消えます。** 先に、いまの中身の
控えを1本取っておいてください（管理画面の「いますぐ控えを取る」）。

### 「30日より前に戻したい」「表ごと消えた」— 控えのJSONから

```bash
# 1. 控えを手元に落とす（管理画面から、または）
curl -H "authorization: Bearer $BACKUP_TOKEN" \
  "https://tasuki.club/api/admin/backup?date=2026-09-01" -o backup.json

# 2. 戻すSQLを作る（**この時点ではまだ何も変わりません**）
node scripts/restore-backup.mjs backup.json > restore.sql

# 3. 中身を目で見る。表と件数が思ったとおりか。
less restore.sql

# 4. 流す
npx wrangler d1 execute tasuki --remote --file=restore.sql
```

`restore.sql` は表ごとに `DELETE` してから入れ直す形（丸ごと差し替え）です。
**一部の表だけ戻したいときは、要る表の行だけ抜き出してから流してください。**

## 困ったとき

- 控えが増えていない → GitHubの `Actions → Backup` を見る。赤くなっていれば
  そこに理由が出ています。合言葉のずれがいちばん多い原因です。
- 管理画面の「バックアップ」が開かない → `ADMIN_EMAILS` にご自身のメール
  アドレスが入っているか確認してください。
