import Link from 'next/link';
import { serviceName } from './brand';

// 規約・ポリシー類の共通の器。中身だけ各ページが渡す。
export default function LegalPage({ eyebrow, title, lead, warning, children, updatedAt }: {
  eyebrow: string;
  title: string;
  lead: string;
  warning?: string;
  children: React.ReactNode;
  updatedAt: string;
}) {
  return <main style={styles.page}><article style={styles.card}>
    {warning && <p style={styles.warning}>{warning}</p>}
    <p style={styles.eyebrow}>{eyebrow}</p>
    <h1 style={styles.title}>{title}</h1>
    <p style={styles.lead}>{lead}</p>
    {children}
    <footer style={styles.footer}>
      <p style={styles.updated}>制定日：{updatedAt}</p>
      <nav style={styles.nav}>
        <Link href="/terms" style={styles.link}>利用規約</Link>
        <Link href="/refund" style={styles.link}>返金・キャンセル</Link>
        <Link href="/tokushoho" style={styles.link}>特定商取引法に基づく表記</Link>
        <Link href="/privacy" style={styles.link}>プライバシーポリシー</Link>
        <Link href="/support" style={styles.link}>サポート</Link>
        <Link href="/" style={styles.link}>{serviceName}へ戻る</Link>
      </nav>
    </footer>
  </article></main>;
}

/** 見出しと本文が並ぶ節。本文は配列で複数段落にできる。 */
export function LegalSection({ heading, body }: { heading: string; body: string | string[] }) {
  const paragraphs = Array.isArray(body) ? body : [body];
  return <section style={styles.section}>
    <h2 style={styles.heading}>{heading}</h2>
    {paragraphs.map((text, index) => <p key={index} style={index === 0 ? styles.body : styles.bodyNext}>{text}</p>)}
  </section>;
}

/** 特商法の表記のような「項目名 → 内容」の並び。 */
export function LegalTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl style={styles.table}>
    {rows.map(([label, value]) => <div key={label} style={styles.row}>
      <dt style={styles.rowLabel}>{label}</dt>
      <dd style={styles.rowValue}>{value}</dd>
    </div>)}
  </dl>;
}

/** 未記入の項目。公開前に気づけるように、目に見える形で出す。 */
export function LegalTodo({ label }: { label: string }) {
  return <span style={styles.todo}>【{label}を記入してください】</span>;
}

export const styles = {
  page: { minHeight: '100vh', padding: '32px 16px 72px', background: '#f5f8fd', color: '#17233c', fontFamily: '-apple-system, BlinkMacSystemFont, "Helvetica Neue", "Yu Gothic", sans-serif' },
  card: { maxWidth: 820, margin: '0 auto', padding: 'clamp(24px, 5vw, 56px)', border: '1px solid #dce5f2', borderRadius: 24, background: '#fff', boxShadow: '0 20px 60px rgba(28,68,130,.08)' },
  warning: { margin: '0 0 24px', padding: '14px 16px', border: '1px solid #f5b9a2', borderRadius: 12, background: '#fff3ee', color: '#c93d0e', fontSize: 14, fontWeight: 800, lineHeight: 1.8 },
  eyebrow: { margin: 0, color: '#1478d6', fontSize: 12, fontWeight: 800, letterSpacing: '.14em' },
  title: { margin: '10px 0 20px', fontSize: 'clamp(28px, 6vw, 42px)', lineHeight: 1.3 },
  lead: { margin: '0 0 34px', color: '#5f7088', fontSize: 16, fontWeight: 600, lineHeight: 1.9 },
  section: { padding: '24px 0', borderTop: '1px solid #e7edf5' },
  heading: { margin: '0 0 10px', fontSize: 19, lineHeight: 1.5 },
  body: { margin: 0, color: '#4e6078', fontSize: 15, lineHeight: 2 },
  bodyNext: { margin: '14px 0 0', color: '#4e6078', fontSize: 15, lineHeight: 2 },
  table: { margin: '0', padding: 0, borderTop: '1px solid #e7edf5' },
  row: { display: 'grid', gridTemplateColumns: 'minmax(160px, 34%) 1fr', gap: 16, padding: '18px 0', borderBottom: '1px solid #e7edf5' },
  rowLabel: { margin: 0, color: '#33445f', fontSize: 14, fontWeight: 800, lineHeight: 1.8 },
  rowValue: { margin: 0, color: '#4e6078', fontSize: 15, lineHeight: 1.95 },
  todo: { color: '#c93d0e', fontWeight: 800 },
  footer: { marginTop: 32, paddingTop: 22, borderTop: '1px solid #e7edf5' },
  updated: { margin: 0, color: '#7a889c', fontSize: 13, fontWeight: 700 },
  nav: { marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: '10px 18px' },
  link: { color: '#1478d6', fontSize: 13, fontWeight: 800 },
} satisfies Record<string, React.CSSProperties>;
