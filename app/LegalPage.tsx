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
    <LegalStyles />
    {warning && <p style={styles.warning}>{warning}</p>}
    <p style={styles.eyebrow}>{eyebrow}</p>
    <h1 style={styles.title}>{title}</h1>
    <p style={styles.lead}>{lead}</p>
    {/* 規約類は長い。ほかの書面への行き来は、最後まで読み切らないと
        できない場所にあってはいけない。頭にも足にも同じ並びを置く。 */}
    <LegalNav />
    {children}
    <footer style={styles.footer}>
      <p style={styles.updated}>制定日：{updatedAt}</p>
      <LegalNav />
    </footer>
  </article></main>;
}

/**
 * ほかの規約・ポリシーへの行き来。
 *
 * もとは13pxの文字だけで、指で押す的が20pxしかなかった（Appleの目安は44px）。
 * 押しても反応しない・そもそも在ることに気づかない、という状態だったので、
 * 押せる四角として出す。next/link ではなく素の <a> にしてあるのは、
 * ルーターが取りこぼしたときに「押しても何も起きない」になるのを避けるため。
 */
export function LegalNav() {
  const links: [string, string][] = [
    ['/terms', '利用規約'],
    ['/refund', '返金・キャンセル'],
    ['/tokushoho', '特定商取引法に基づく表記'],
    ['/privacy', 'プライバシーポリシー'],
    ['/support', 'サポート'],
    ['/', `${serviceName}へ戻る`],
  ];
  return <nav className="legal-nav" aria-label="規約とポリシー">
    {links.map(([href, label]) => <a key={href} href={href}>{label}</a>)}
  </nav>;
}

/** 見出しと本文が並ぶ節。本文は配列で複数段落にできる。 */
export function LegalSection({ heading, body }: { heading: string; body: string | string[] }) {
  const paragraphs = Array.isArray(body) ? body : [body];
  return <section style={styles.section}>
    <h2 style={styles.heading}>{heading}</h2>
    {paragraphs.map((text, index) => <p key={index} style={index === 0 ? styles.body : styles.bodyNext}>{text}</p>)}
  </section>;
}

/**
 * 特商法の表記のような「項目名 → 内容」の並び。
 *
 * 中身の幅は文字が決めるので、インラインの style では収まらない。
 * 2列のままだと、スマホでは右の列が160pxほどしか残らず、メールアドレスの
 * ような切れ目の無い長い文字列が枠からはみ出していた。狭い画面では
 * 「項目名の下に内容」の1列に畳み、長い文字列はどこでも折り返す。
 */
export function LegalTable({ rows }: { rows: [string, React.ReactNode][] }) {
  return <dl className="legal-table">
    {rows.map(([label, value]) => <div key={label} className="legal-row">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>)}
  </dl>;
}

/**
 * 規約類の見た目のうち、幅や指で押す的の大きさに関わるところ。
 * インラインの style ではメディアクエリが書けないので、ここだけCSSにしている。
 * LegalPage を使わないページ（サポート）でも、これを置けば同じ見た目になる。
 */
export function LegalStyles() {
  return <style dangerouslySetInnerHTML={{ __html: legalCss }} />;
}

const legalCss = `
.legal-table { margin:0; padding:0; border-top:1px solid #e7edf5; }
.legal-row { display:grid; grid-template-columns:minmax(150px,32%) minmax(0,1fr); gap:16px; padding:18px 0; border-bottom:1px solid #e7edf5; }
.legal-row dt { margin:0; color:#33445f; font-size:14px; font-weight:800; line-height:1.8; }
/* minmax(0,1fr) と合わせて、長いメールアドレスやURLを枠の中で折り返す。 */
.legal-row dd { margin:0; min-width:0; color:#4e6078; font-size:15px; line-height:1.95; overflow-wrap:anywhere; word-break:break-word; }
@media (max-width:620px) {
  .legal-row { grid-template-columns:minmax(0,1fr); gap:5px; padding:15px 0; }
  .legal-row dt { font-size:13px; }
}
.legal-nav { margin:0 0 30px; display:flex; flex-wrap:wrap; gap:8px; }
.legal-nav a { min-height:44px; padding:0 14px; display:inline-flex; align-items:center; border:1px solid #cfe0f5; border-radius:11px; background:#f2f7fe; color:#1478d6; font-size:13px; font-weight:800; text-decoration:none; }
.legal-nav a:active { background:#e2edfc; }
footer .legal-nav { margin:14px 0 0; }
`;

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
  todo: { color: '#c93d0e', fontWeight: 800 },
  footer: { marginTop: 32, paddingTop: 22, borderTop: '1px solid #e7edf5' },
  updated: { margin: 0, color: '#7a889c', fontSize: 13, fontWeight: 700 },
} satisfies Record<string, React.CSSProperties>;
