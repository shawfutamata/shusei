import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'サポート｜GIVE HUB', description: 'GIVE HUBの使い方とお問い合わせ窓口' };

const contactEmail = 'shaw_futamata@every-counts.com';

const faqs = [
  ['ログインできません', '本アプリは守成クラブの登録済み会員専用です。運営に登録されているメールアドレスを入力してください。登録済みでも「利用権限がありません」と表示される場合は、会員登録の有効化がまだか、契約が終了している可能性があります。下記の窓口へご連絡ください。'],
  ['認証コードが届きません', '迷惑メールフォルダをご確認ください。届かない場合は1分後に再送できます。それでも届かないときは、登録されているメールアドレスが今お使いのものと一致しているかご確認ください。'],
  ['名刺の読み取り精度を上げたい', '名刺全体が枠に入るように、明るい場所で正面から撮影してください。読み取り結果は保存前の画面で修正できます。文字の認識はすべて端末内で行い、読み取った生テキストはサーバーへ送信しません。'],
  ['通知が来ません', 'マイページの「通知を受けたい関連業種」が設定されているかご確認ください。あわせて、端末の設定でGIVE HUBの通知が許可されているかもご確認ください。'],
  ['顔写真の登録は必須ですか', '必須です。誰からの探しごと・紹介なのかが分かることが、安心して紹介し合うための前提だからです。'],
  ['料金はかかりますか', 'アプリは無料です。守成クラブの会員契約はアプリの外で行われ、アプリ内での購入や課金は一切ありません。'],
];

export default function SupportPage() {
  return <main style={styles.page}><article style={styles.card}><p style={styles.eyebrow}>SUPPORT</p><h1 style={styles.title}>サポート</h1><p style={styles.lead}>GIVE HUB（守成クラブ会員向けの紹介・探しごとアプリ）のお問い合わせ窓口とよくあるご質問です。</p><section style={styles.contact}><h2 style={styles.contactHeading}>お問い合わせ</h2><p style={styles.body}>ご質問・不具合のご連絡は <a href={`mailto:${contactEmail}`} style={styles.link}>{contactEmail}</a> までお願いします。3営業日以内にご返信します。</p><p style={styles.body}>不具合のご連絡には、お使いの端末（iPhone / Android）とアプリのバージョン、操作の手順を添えていただけると解決が早くなります。</p></section>{faqs.map(([question, answer]) => <section key={question} style={styles.section}><h2 style={styles.heading}>{question}</h2><p style={styles.body}>{answer}</p></section>)}<section style={styles.section}><h2 style={styles.heading}>アカウントの削除</h2><p style={styles.body}>アプリの「マイページ」下部から、プロフィール、投稿、紹介、名刺画像、通知端末、ログインセッションを削除できます。削除後は元に戻せません。アプリから削除できない場合は <a href={`mailto:${contactEmail}`} style={styles.link}>{contactEmail}</a> へご連絡ください。詳しくは<a href="/privacy#delete" style={styles.link}>プライバシーポリシー</a>をご覧ください。</p></section></article></main>;
}

const styles = {
  page: { minHeight: '100vh', padding: '32px 16px 72px', background: '#f5f8fd', color: '#17233c', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Yu Gothic", sans-serif' },
  card: { maxWidth: 820, margin: '0 auto', padding: 'clamp(24px, 5vw, 56px)', border: '1px solid #dce5f2', borderRadius: 24, background: '#fff', boxShadow: '0 20px 60px rgba(28,68,130,.08)' },
  eyebrow: { margin: 0, color: '#2563eb', fontSize: 12, fontWeight: 800, letterSpacing: '.14em' },
  title: { margin: '10px 0 20px', fontSize: 'clamp(30px, 7vw, 46px)', lineHeight: 1.25 },
  lead: { margin: '0 0 34px', color: '#5f7088', fontSize: 16, fontWeight: 600, lineHeight: 1.9 },
  contact: { padding: 'clamp(18px, 3vw, 26px)', borderRadius: 18, background: '#eaf3ff' },
  contactHeading: { margin: '0 0 10px', fontSize: 20, lineHeight: 1.5 },
  section: { padding: '24px 0', borderTop: '1px solid #e7edf5' },
  heading: { margin: '0 0 10px', fontSize: 20, lineHeight: 1.5 },
  body: { margin: '0 0 6px', color: '#4e6078', fontSize: 15, lineHeight: 2 },
  link: { color: '#2563eb', fontWeight: 700 },
} satisfies Record<string, React.CSSProperties>;
