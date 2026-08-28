import type { Metadata } from 'next';
import { serviceName } from '../brand';

export const metadata: Metadata = { title: `プライバシーポリシー｜${serviceName}`, description: `${serviceName}の個人情報の取扱いについて` };

const sections = [
  ['1. 取得する情報', '本サービスは、メールアドレス、氏名・顔写真・会社名・所属会場・役職・バッヂ・活動エリア・業種・任意の年商区分、投稿・紹介内容、名刺画像および名刺から登録した連絡先、端末の通知トークン、利用日時やエラー等の技術情報を取得します。'],
  ['2. 利用目的', '会員本人の確認、プロフィール表示、探しごとと紹介の提供、関連業種の通知、名刺リストの本人向け保存、不正利用防止、問い合わせ対応、品質・安全性の改善のために利用します。'],
  ['3. 名刺情報の取扱い', '名刺情報は登録した会員本人だけが閲覧できる領域に保存します。利用者は、名刺に記載された第三者の情報を本サービスへ登録する権限または正当な利用目的があることを確認してください。'],
  ['4. 外部サービスへの委託', 'サービス運営に必要な範囲で、ホスティング、データ保存、メール送信、プッシュ通知、アプリ配信等の事業者へ処理を委託する場合があります。委託先には必要な範囲の情報だけを取り扱わせ、適切な安全管理を求めます。'],
  ['5. 第三者提供', '法令に基づく場合、生命・身体・財産の保護に必要な場合、または本人の同意がある場合を除き、個人情報を第三者へ販売または提供しません。紹介先へ連絡先を渡す場合は、利用者が内容を確認して送信します。'],
  ['6. 保存期間と削除', '利用目的に必要な期間だけ情報を保存します。アプリの「マイページ」からアカウントを削除すると、プロフィール、投稿、紹介、名刺および認証セッションを削除します。法令上の保存義務または不正対策上必要な記録は、必要期間に限り保持する場合があります。'],
  ['7. 安全管理', '通信の暗号化、認証トークンの安全な保存、アクセス制御、秘密情報の分離等、合理的な安全管理措置を講じます。'],
  ['8. 通知と端末権限', 'カメラと写真へのアクセスは名刺撮影・プロフィール写真登録に、通知権限は関連する探しごとのお知らせに使用します。権限は端末設定からいつでも変更できます。'],
  ['9. 改定', '機能や法令の変更に応じて本ポリシーを改定することがあります。重要な変更は本サービス内で案内します。'],
];

export default function PrivacyPage() {
  return <main style={styles.page}><article style={styles.card}><p style={styles.eyebrow}>PRIVACY POLICY</p><h1 style={styles.title}>プライバシーポリシー</h1><p style={styles.lead}>{serviceName}（以下「本サービス」）は、守成クラブ会員向けの紹介・探しごとサービスとして、利用者の情報を次のとおり取り扱います。</p>{sections.map(([title, body]) => <section key={title} style={styles.section}><h2 style={styles.heading}>{title}</h2><p style={styles.body}>{body}</p></section>)}<section id="delete" style={styles.section}><h2 style={styles.heading}>10. お問い合わせ・削除依頼</h2><p style={styles.body}>アプリ内で削除できない場合や、個人情報の開示・訂正・削除に関するお問い合わせは <a href="mailto:shaw_futamata@every-counts.com" style={styles.link}>shaw_futamata@every-counts.com</a> までご連絡ください。</p></section><footer style={styles.footer}>制定日：2026年8月27日</footer></article></main>;
}

const styles = {
  page: { minHeight: '100vh', padding: '32px 16px 72px', background: '#f5f8fd', color: '#17233c', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Yu Gothic", sans-serif' },
  card: { maxWidth: 820, margin: '0 auto', padding: 'clamp(24px, 5vw, 56px)', border: '1px solid #dce5f2', borderRadius: 24, background: '#fff', boxShadow: '0 20px 60px rgba(28,68,130,.08)' },
  eyebrow: { margin: 0, color: '#2563eb', fontSize: 12, fontWeight: 800, letterSpacing: '.14em' },
  title: { margin: '10px 0 20px', fontSize: 'clamp(30px, 7vw, 46px)', lineHeight: 1.25 },
  lead: { margin: '0 0 34px', color: '#5f7088', fontSize: 16, fontWeight: 600, lineHeight: 1.9 },
  section: { padding: '24px 0', borderTop: '1px solid #e7edf5' },
  heading: { margin: '0 0 10px', fontSize: 20, lineHeight: 1.5 },
  body: { margin: 0, color: '#4e6078', fontSize: 15, lineHeight: 2 },
  link: { color: '#2563eb', fontWeight: 700 },
  footer: { marginTop: 28, color: '#7a889c', fontSize: 13, fontWeight: 700 },
} satisfies Record<string, React.CSSProperties>;
