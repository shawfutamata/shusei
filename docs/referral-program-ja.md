# 会員紹介（招待）の仕組み

更新日: 2026-08-29

> 規模について: 公開情報で確認できたのは「全国243〜300会場・約24,000〜30,000社」（会場サイトにより数字と更新時期が異なる）。以前この文書にあった「約450会場」は裏付けが取れなかったため取り下げた。

## 何を狙っているか

会員を増やしたいが、**サブスク会員が消えては困る**。この2つを両立させる。

守成クラブは会員数に上限がある**閉じた市場**なので、「◯人紹介したら永久無料」は採用しない。永久無料にすると、会員が増えきった時点で全員が無料の資格を持ち、売上がゼロに向かうため。

代わりに**月単位**で返す。月額をPとすると:

| やり方 | 入ってくる | 出ていく | 結果 |
|---|---|---|---|
| 3人紹介で永久無料 | 3人 × P × 継続年数 | 紹介者の会費が永久に0 | 飽和すると赤字 |
| **紹介1人につき1ヶ月無料** | 1人が年12ヶ月払う = 12P | 1P | **常に11P黒字** |

期間型なら配るほど黒字で、成長が止まれば無料の配布も止まり、売上が戻る。

## ルール

1. 会員はそれぞれ**招待リンク**を持つ。`https://<ドメイン>/join/<8桁のコード>`
2. リンクから登録した人は `membership_status = 'invited'`（利用不可）で作られる。**招待だけでは利用権限は付かない。** 運営が確認して `active` にする。
3. 招待された人が `active` になって **30日** 続いたら、紹介した人に**無料1ヶ月**が確定する。
4. 上限は**直近12ヶ月で6ヶ月ぶん**。ただし**枠を超えたぶんは消えない**。`waiting`（順番待ち）として残り、直近12ヶ月の枠が空いた時点で古い順に自動で確定する。
   - 「6枠を使い切ったら、それ以降の紹介はタダ働き」にはならない
   - 一方で、1年に受け取れるのは最大6ヶ月ぶんまで（＝最大でも半額）なので、売上は守られる
   - 12人紹介した年でも、会費が安くなるのは6ヶ月ぶん。残り6人ぶんは翌年へ回る
5. 30日に届く前に解約した人は、無料月にならない。
6. すでに会員のメールアドレスで招待リンクを踏んでも、紹介は付かない。既存会員の付け替えを防ぐため。

定数はコードの1箇所にある。変えるときはここ。

```ts
// db/data.ts
export const REFERRAL_QUALIFY_DAYS = 30;
export const REFERRAL_CAP_PER_YEAR = 6;
```

## プランと支払い周期で意味が変わる

ルールは1つ。**「紹介1人につき、いま払っている料金の1ヶ月ぶんが安くなる」**。

| 紹介した人 | 受け取るもの | データ上の扱い |
|---|---|---|
| 有料会員（月払い） | 次回の請求から**月額の1ヶ月ぶん**を引く | 確定と同時にStripeの顧客残高へ入れ、`applied_month` を記録 |
| 有料会員（年払い） | 次回の請求から**年額 ÷ 12** を引く | 同上 |
| 無料会員 | **プレミアムが1ヶ月使える** | その場で `plan='premium'`、`plan_period_end` を1ヶ月延長、`plan_source='referral'`、`applied_month` を記録 |

### 年払いの人がもらう額を「割引後の月あたり」にしている理由

年払いは20%OFFなので、プレミアムなら年48,000円＝月あたり4,000円。ここで定価の5,000円を返すと、**20%OFFと紹介の無料月が二重取り**になり、6人紹介すると年48,000円のうち30,000円が引かれて実質62%OFFになってしまう。

割引後の月あたり額（4,000円）にすれば、6人でも24,000円＝**ちょうど半額**で、月払いの人と同じ「1年で最大でも半額」に収まる。1つの上限で両方の周期を守れる。

金額の計算は `monthlyEquivalentYen(plan, cycle)`（`app/plan-catalog.ts`）1箇所にある。

### いつ引かれるか

**確定した時点でStripeの顧客残高に入れる。** 会員がマイページを開いたときに走る（`app/billing-credits.ts`）。残高は次回以降の請求から自動で引かれるので、運営が手で消し込む作業はない。

年払いの人は次の請求が最大1年先になるため、招待カードに「1人につき◯◯円・次回の年額のお支払いから引かれます」と出して、いま得していることが分かるようにしてある。

無料会員にとっては「1人連れてくると有料機能を試せる」入口になる。線引きは `docs/pricing-plan-ja.md`。

## 会場・法人単位は別枠

個人が1人ずつ連れてくるより、**世話人が会場ごと連れてくる**方が桁が違う。世話人1人を無料にして会場の数十人が課金するなら、上限を付ける必要はない。

会場単位は上の自動計算に載せず、`membership_source = 'organization_contract'` と `organization_id` を運営が手で設定して運用する。個人向けの無料月とは混ぜない。

## 運用

### 招待された人を承認する

招待リンクから登録した人は、`invited_by` に紹介者のIDが入った状態で `invited` として並ぶ。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "SELECT m.id, m.email, m.display_name, m.created_at, i.display_name AS invitedBy
             FROM members m LEFT JOIN members i ON i.id = m.invited_by
             WHERE m.membership_status = 'invited' ORDER BY m.created_at DESC"
```

契約が済んだら有効にする。`activated_at` を入れておくと、30日の起算日がはっきりする（省略するとシステムが気づいた日を入れる）。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE members SET membership_status = 'active', activated_at = '2026-09-01T00:00:00.000Z'
             WHERE email = 'member@example.jp'"
```

### 無料月の消し込みは自動

会員がマイページを開いたときに、資格判定・確定・Stripeへの反映まで自動で走る（何度走らせても二重にはならない）。運営の作業は不要。

Stripeを設定していない間だけ、下のSQLで残高を確認して手で消し込む。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "SELECT i.email, i.display_name, COUNT(*) AS freeMonths
             FROM referral_credits c JOIN members i ON i.id = c.inviter_id
             WHERE c.status = 'earned' AND c.applied_month = ''
             GROUP BY c.inviter_id ORDER BY freeMonths DESC"
```

請求に反映したら、使った月を記録して二重に使われないようにする。

```bash
npx wrangler d1 execute <D1_DATABASE> --remote \
  --command "UPDATE referral_credits SET applied_month = '2026-09'
             WHERE status = 'earned' AND applied_month = ''
               AND inviter_id = (SELECT id FROM members WHERE email = 'member@example.jp')
             LIMIT 1"
```

## アプリとWebで見せ方を分けている

App Storeのガイドライン3.1.1と `docs/billing-architecture.md` により、**アプリ内に価格・割引を出せない**。そのため取得口を2つに分けてある。

| 経路 | 使う場所 | 返すもの |
|---|---|---|
| `GET /api/invite` | iOS・Android | 招待リンク、招待した人数、利用中、確認待ち。**金額・無料月は含めない** |
| `GET /api/referral` | Webのみ | 上記に加えて、無料になった月、上限、今年の残り |

アプリのマイページには「仲間を招待する」と人数しか出さない。無料月の話はWebだけ。申請前チェックのときはこの2つの経路を見ること。

## 法律面で確認しておくこと

紹介した人数に応じて**現金や報酬を配る**形にすると、連鎖販売取引（特定商取引法）に該当する可能性がある。いまの設計は**自分の会費が安くなるだけ**でお金は動かないが、報酬を配る形へ広げるときは専門家に確認すること。

## データ構造

```sql
-- members
invite_code   TEXT  -- 自分の招待コード。初回に自動生成
invited_by    TEXT  -- 紹介してくれた会員のid
activated_at  TEXT  -- activeになった日。30日の起算点

-- referral_credits（招待された人1人につき最大1行）
inviter_id     TEXT
invitee_id     TEXT UNIQUE
status         TEXT  -- waiting（順番待ち）| earned（1ヶ月ぶん確定）
earned_at      TEXT  -- 確定した日。順番待ちのあいだは空。直近12ヶ月の枠はこの日付で数える
applied_month  TEXT  -- 運営が請求で使った月 YYYY-MM。空なら未使用
```
