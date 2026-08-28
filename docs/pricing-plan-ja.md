# 無料会員と有料会員の線引き

更新日: 2026-08-28

## 考え方

> **みんなの役に立つ行動は無料。自分の商売のために使い倒すところを有料。**

紹介掲示板は、投稿が多いほど・紹介する人が多いほど価値が上がる。だから「見る」と「人を紹介する（ギブ）」は必ず無料にする。ここを有料にするとサービスそのものが痩せる。

守成クラブは会員数に上限がある閉じた市場なので、入口を狭くすると人が溜まる前に止まる。ベースは無料で広く入れる。

## 線引き

| | 無料会員 | 有料会員 |
|---|---|---|
| 掲示板を見る | ○ 全件 | ○ |
| 人を紹介する（ギブ） | ○ 無制限 | ○ |
| 届いた紹介を受け取る | ○ | ○ |
| プロフィール・ランク・招待 | ○ | ○ |
| 探しごとを投稿する | **月1件** | 無制限 |
| 名刺帳に保存する | **30枚** | 無制限 |
| 名刺をカメラで一括読み取り | × | ○ |
| 会員を探す（業種・エリア・会場・年商） | × | ○ ※未実装 |
| 届いた紹介の書き出し | × | ○ ※未実装 |

投稿を月1件だけ残すのが要。ゼロにすると掲示板が空になるが、1件試せると「紹介が本当に来る」体験ができ、2件目を出したくなる。ここが一番強い転換点。

## 有料が切れたとき、データは取り上げない

- 登録済みの名刺は見られる。新規の一括読み取りだけ止まる
- 過去の投稿は残る。新規が月1件に戻るだけ

経営者向けのサービスで「払わなくなったら消えた」は致命的なので、この方針は変えないこと。

## 紹介（招待）との関係

`docs/referral-program-ja.md` の「紹介1人＝1ヶ月ぶんのクレジット」は、プランによって意味が変わる。**仕組みは1つのまま。**

| 紹介した人 | 受け取るもの | 実装 |
|---|---|---|
| 有料会員 | 請求から1ヶ月ぶん引く | `referral_credits` に `applied_month = ''` で残す。運営が請求時に消し込む |
| 無料会員 | **有料機能が1ヶ月使える** | その場で `plan = 'pro'`、`plan_period_end` を1ヶ月延長、`plan_source = 'referral'` |

無料会員が仲間を1人連れてくると有料機能を試せる。試した人が課金する。招待が集客と有料転換の両方をやる。

## コードの構造

判定は **`app/entitlements.ts` の1箇所だけ**。画面のあちこちに `plan === 'pro'` を書かない。**画面は隠すだけ、実際に止めるのは必ずAPI側。**

```ts
// app/entitlements.ts
isPro(state)                                  // plan==='pro' かつ期限内
can(state, 'scan_business_card')              // 機能ごとの可否
remainingRequests(state, usedThisMonth)       // 無料は月1件
remainingBusinessCards(state, stored)         // 無料は30枚
```

止めている場所（サーバー側）:

- `createRequest()` … 無料なら今月の投稿数を数えて拒否
- `createBusinessCards()` … 無料なら保存枚数の上限で拒否

会員のデータ:

```sql
plan            TEXT  -- free | pro
plan_period_end TEXT  -- YYYY-MM-DD。空なら期限なし（会場・法人契約）
plan_source     TEXT  -- direct | organization | referral
```

`membership_status`（守成クラブの会員かどうか。運営が承認する）とは**別の軸**。会員でなければそもそも入れない、会員のうえで無料か有料か、という二段になっている。

## 有料にする・戻す

```bash
# 有料にする（期限なし。会場・法人契約もこれ）
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE members SET plan='pro', plan_period_end='', plan_source='direct' WHERE email='member@example.jp'"

# 期限つきで有料にする
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE members SET plan='pro', plan_period_end='2027-03-31', plan_source='direct' WHERE email='member@example.jp'"

# 無料に戻す
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE members SET plan='free', plan_period_end='', plan_source='' WHERE email='member@example.jp'"
```

会場ぐるみの契約は、その会場の会員をまとめて `plan='pro'`、`plan_source='organization'` にする。

## アプリとWebの違い（ストア審査）

App Storeのガイドライン3.1.1により、**アプリ内に価格・割引・購入への誘導を置けない**。無料＋有料になったことで、ここの危険度が上がっている。

**アプリには、その人がいま使える機能しか出さない。**

- 無料会員のアプリでは、名刺の一括読み取り画面を**表示しない**。グレーアウトや鍵アイコンも出さない（「どこで買うのか」と聞かれる）
- 「アップグレード」ボタン、価格、Webへの誘導文は一切置かない
- 契約はWebだけ。アプリは状態を反映するだけ

取得口も分けてある。

| 経路 | 使う場所 | 返すもの |
|---|---|---|
| `GET /api/entitlements` | アプリ・Web | 使えるかどうかと件数だけ。**金額・割引は含めない** |
| `GET /api/referral` | Webのみ | 無料月の残高を含む |

将来アプリの中で売るなら、そのときはアプリ内課金（手数料15〜30%）が要る。当面は外部契約のみ。

## 決まっていないこと

- **価格**。月額・年額、会場単位のまとめ価格
- 「会員を探す」と「紹介の書き出し」は未実装。`entitlements.ts` に枠だけ用意してある
