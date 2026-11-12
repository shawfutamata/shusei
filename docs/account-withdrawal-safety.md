# 退会時のデータ保護（ローカル実装・公開前）

`deleteMobileAccount` の修正。匿名会員の保持や、相手の取引記録を一括削除する方針は新設していない。

## 自動処理できる範囲

共有・金銭・例会の依存がない場合に限り、会員・本人の案件/コメント/報告/アンケート/名簿・フィードバック・行動履歴・既読/非表示・未使用広告券/抽選記録を削除する。

LINEアカウント、通知outbox（受付済みも含む）、LINEセッション、全モバイルセッション、OAuthフロー（member_idまたは本人のsession_hash）、プライバシー確認コード、LINE由来情報/同意の記録、メール認証コード、登録用メール認証コード、Push登録も削除する。登録コードから本人メールだけに結び付くdraftとOAuthフローも削除し、他メールと共用のdraftは消さない。LINEユーザーIDを含む墓標は残さない。Webhook受信表は元々event_id/received_atのみで、会員IDやLINEユーザーIDは持たない。

画像はアバター・案件写真の全インデックス・動画を削除する。D1成功前にR2は変更しない。

## 止める範囲と必要な決定

以下がある退会は、データを変更せず明示的なエラーで運営確認に戻す。自動退会成功とは表示しない。

- DM、紹介/広告オファー、そのメッセージ、他会員のコメント・返信・報告、共有アンケート紹介、別の所有者を持つ名簿行。相手の商談記録まで削除してよいか、本人の内容だけ消去するか、匿名化して保持するか、期間を含め運用決定が必要。
- 紹介クレジットと他会員からのinvited_by参照。相手の特典を失わせない処理が必要。
- Stripe顧客/契約参照、有料プラン、すべての広告枠（無料を含む）、取り置き/使用済み広告券。契約の解約、未完了決済、領収/精算/特典記録の保存期間を先に決める必要がある。ローカル行の削除ではStripe契約は解約されない。
- 例会member link。外部キーがなく、別表の名簿・回答・AI結果にも本人情報があるため、リンクだけ削除して完全消去としない。

**保守的な制限:** 未返信の自分のオファー、無料広告も自動退会の対象外。既存のデータの意味を勝手に決めるより、明示的な未完了を優先している。連携解除は退会と別の操作であり、退会が拒否された場合に暗黙に実行しない。

## 実際の外部キー一覧

`ensureDatabase()` / `lineStatements` の実行時スキーマが正。Drizzleだけでは検証しない。

- membersを参照: request_comments.member_id, referral_credits.inviter_id/invitee_id, requests.author_id, member_product_events.member_id, ad_slots.member_id, feedback.member_id, request_reports.reporter_id, matching_surveys.member_id, survey_introductions.member_id, introductions.introducer_id, ad_introductions.introducer_id, introduction_messages.sender_id, ad_introduction_messages.sender_id, direct_messages.sender_id/recipient_id, push_subscriptions.member_id, mobile_sessions.member_id, mobile_push_tokens.member_id, attendance_events.owner_id, attendance_people.owner_id, thread_hides.member_id, thread_reads.member_id, member_days.member_id, gacha_days.member_id, gacha_draws.member_id, ad_gifts.member_id, line_accounts.member_id, line_sessions.member_id, line_notification_outbox.member_id, line_data_origins.member_id, line_privacy_codes.member_id。
- requestsを参照: request_comments.request_id, request_reports.request_id, introductions.request_id。
- ad_slotsを参照: ad_daily.ad_id, ad_introductions.ad_id。
- introductions / ad_introductionsを参照: 各メッセージ表の親ID。
- matching_surveysを参照: survey_introductions.survey_id。
- attendance_eventsを参照: attendance_people.event_id。
- 外部キーのない依存: members.invited_by, request_comments.thread_with, meeting_member_links.member_id, ad_gifts.used_ad_id/held_ad_id, line_oauth_flows.member_id/session_hash, mobile_auth_codes.email。

共有・金銭行を削除せず各DELETEに同じ保護条件を付けるため、事前確認後にその依存が増えた場合もbatch全体が何も変更しない。未把握の外部キーが増えた場合はD1 batchの原子性で全変更をロールバックする。

## 残る運用上の注意

- D1とR2は同一トランザクションにできない。R2削除失敗は握りつぶさず、「アカウント・LINE連携は削除済み、画像の削除確認が必要」というエラーを返す。永続的な削除ジョブ/再試行台帳は未実装で、失敗時の運営処理が必要。会員削除後の単純な再実行では画像キーを再取得できない。
- 既存バックアップやStripe等の外部サービスの記録を消去する処理ではない。バックアップの保持期間と復元時の再消去手順は別途決定が必要。
- Web CookieとBearerは同じセッション表を参照するため、退会後の古いトークンは無効。Google通常ログインからのearly枠/招待コード単独の自動登録を廃止し、登録画面の同意済みdraft経由だけを維持する。upsertMemberは既存行のUPDATEだけに変更し、認証後に退会と競合したリクエストでも消えた会員を再作成しない。
- 本人メール/会員IDと結び付かない、すでに同意済みの独立した登録draftは取り消せない。そのdraftを使う進行中のGoogle/LINE新規登録は別IDで登録を完了できる。第三者のdraftを巻き添えにしないため一括削除しない。本人に紐付く登録トランザクション管理は今後の設計事項。
- 同時にアップロードされるR2画像まで完全に排他する仕組みはない。全サービスの書き込み停止を伴う完全消去ワークフローは別途設計する。

## 検証

`node tests/account-withdrawal-runtime.mjs`

隔離Miniflareの実D1/R2を使用。複数会員・全削除対象・LINEキュー/コード/セッション・複数写真/動画を投入し、成功時の本人データ消去、他会員の行と画像の保持、共有/金銭/例会ケースの無変更拒否、未知FKによるbatch全体のロールバックを検証する。外部通信は許可しない。

追加の認証境界検証: `node tests/account-withdrawal-auth-audit.mjs`

実D1で旧セッション失効、LINEの旧link/login拒否、退会と競合するupsert拒否、登録コード・排他的draft/OAuth消去、他メールと共用draftの保持を検証する。Google callbackの自動登録廃止はソース構造を検証しており、この専用テスト自体はGoogle HTTP callbackを駆動しない。本人に紐付かない同意済みdraftによる再登録は、残る制限として明示して再現する。
