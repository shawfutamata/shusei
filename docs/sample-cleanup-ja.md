# サンプルの募集を本番から消す（ターミナル不要）

## なぜ手作業なのか

一度、この片づけをアプリの起動処理（`ensureDatabase`）に入れて、**サイト全体が
開かなくなりました**。起動処理はページを開くたびに走ります。そこで
`FOREIGN KEY constraint failed` が出ると、その先の画面がすべて500になります。

片づけは、たった1回しかやらない仕事です。1回の仕事を、毎回走る場所に置いては
いけません。**このファイルの手順で、1回だけ手で流してください。**

## 場所

Cloudflare ダッシュボード → 左メニュー **Storage & Databases** → **D1** →
`tasuki` → 上のタブの **Console**。ここにSQLを貼って `Execute` を押します。
ターミナルは使いません。

---

## 手順1：何が消えるのかを、先に見る

**消す前に、必ずこれを流してください。** 消える行が目で見えます。

```sql
SELECT id, email, display_name, venue, company
FROM members
WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com';
```

```sql
SELECT r.id, r.title, m.display_name AS author
FROM requests r JOIN members m ON m.id = r.author_id
WHERE m.email LIKE '%@example.jp' OR m.email LIKE '%@example.com';
```

出てきた行が「サンプルだけ」であることを確かめてください。
**本物の会員が1人でも混ざっていたら、そこで止めて、出てきた内容を教えてください。**
条件を作り直します。

なお、サンプルの募集は次の2件です（見出しで見分けがつきます）。

- 店舗の採用課題を一緒に解決できる、動画制作会社を探しています（田中 美咲）
- 10月オープン予定の美容室に強い、内装デザイナーを探しています（佐藤 健一）

もし手順1で何も出てこないのに画面にはサンプルが残っている場合は、
メールアドレスが違う形で入っています。次を流して、出た `id` を教えてください。

```sql
SELECT r.id, r.title, r.author_id, m.email
FROM requests r JOIN members m ON m.id = r.author_id
ORDER BY r.created_at;
```

---

## 手順2：消す

**1行ずつ、上から順に流してください。** 順番には意味があります。
募集にぶら下がっている行（コメント・紹介）を先に消さないと、
外部キー制約でエラーになります。1回目の失敗はこれが原因でした。

```sql
DELETE FROM request_comments WHERE request_id IN (
  SELECT r.id FROM requests r JOIN members m ON m.id = r.author_id
  WHERE m.email LIKE '%@example.jp' OR m.email LIKE '%@example.com');
```

```sql
DELETE FROM introductions WHERE request_id IN (
  SELECT r.id FROM requests r JOIN members m ON m.id = r.author_id
  WHERE m.email LIKE '%@example.jp' OR m.email LIKE '%@example.com');
```

```sql
DELETE FROM requests WHERE author_id IN (
  SELECT id FROM members
  WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

ここまでで、**募集は消えます**。ショウさんが頼んだのはここまでです。

---

## 手順3（任意）：サンプルの会員も消す

募集を消せば、サンプルの会員は掲示板には出てきません。ただ、会員数や
ランキングの数に混ざるのが気になるようなら、続けてこれも流してください。
やはり**1行ずつ、上から順に**です。

```sql
DELETE FROM ad_daily WHERE ad_id IN (
  SELECT id FROM ad_slots WHERE member_id IN (
    SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com'));
```

```sql
DELETE FROM ad_slots WHERE member_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM request_comments WHERE member_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM introductions WHERE introducer_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM referral_credits WHERE inviter_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com')
  OR invitee_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM feedback WHERE member_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM push_subscriptions WHERE member_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM mobile_auth_codes
WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com';
```

```sql
DELETE FROM mobile_sessions WHERE member_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM mobile_push_tokens WHERE member_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM attendance_people WHERE owner_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM attendance_events WHERE owner_id IN (
  SELECT id FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com');
```

```sql
DELETE FROM members WHERE email LIKE '%@example.jp' OR email LIKE '%@example.com';
```

最後の1行が `FOREIGN KEY constraint failed` で止まったら、**まだどこかに
その会員を指している行が残っています**。エラーをそのまま教えてください。
無理に消さなくても、募集さえ消えていれば画面には出てきません。

---

## 消したあとにサンプルが生え直さないか

生えません。サンプルを入れる処理（`seedDemoData`）は
`if (!import.meta.env.DEV) return;` で始まっていて、本番のビルドでは
中身ごと消えます。手元の開発サーバーだけで動きます。

---

## このSQLは、手で流す前に試してあります

前回の失敗を繰り返さないために、上のSQLを**手元のデータベースの複製に、
外部キー制約を効かせたまま、上から順に全部流して**確かめました。

```
19本すべてOK / エラー 0本
サンプル会員 14人・サンプル募集 11件が消え、本物の会員は残った
```

サンプルの会員IDは、古い本番では `demo-tanaka` `demo-sato` のような
`demo-` 始まりです（いまのコードは `sample-` 始まりですが、そちらは
手元の開発サーバーにしか入りません）。どちらもメールアドレスが
`@example.jp` なので、上の条件で拾えます。
