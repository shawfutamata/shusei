'use client';

import { useEffect, useState, type ReactNode } from 'react';
import BrandMark from '../BrandMark';
import LegalLinks from '../LegalLinks';
import './welcome.css';

// Public examples only. Never load member posts or profiles before authentication.
const examples = [
  { tag: 'Web・デザイン', title: '新しいお店のホームページをお願いしたい', budget: '20〜40万円', area: 'オンライン可', detail: '店舗の雰囲気が伝わるサイトを作りたいです。構成の相談から制作まで、相談できる方を探しています。', offer: '店舗サイトの制作をしています。ご希望の雰囲気や公開時期を伺えますか？' },
  { tag: '清掃・設備', title: '店舗の定期清掃をお願いできる会社を探しています', budget: '月額5〜10万円', area: '東京都', detail: '営業前の時間帯に、床や水回りの定期清掃をお願いしたいです。まずは頻度や作業範囲をご相談させてください。', offer: '店舗の定期清掃に対応しています。場所とご希望の頻度を教えていただけますか？' },
  { tag: '動画・撮影', title: 'サービス紹介の短い動画を制作したい', budget: '10〜30万円', area: 'オンライン可', detail: 'WebサイトやSNSで使う紹介動画を検討しています。企画や撮影方法から相談できる方を探しています。', offer: 'サービス紹介動画を制作しています。伝えたい内容について、一度お話しできますか？' },
];

export default function Welcome({ children, initialMessage }: { children: ReactNode; initialMessage: string }) {
  const [mode, setMode] = useState<'find' | 'post'>('find');
  const [selected, setSelected] = useState<number | null>(null);
  const [offer, setOffer] = useState(false);
  const [draft, setDraft] = useState('お店のホームページを作れる方を探しています');
  const [preview, setPreview] = useState(false);
  const [invite, setInvite] = useState('');
  const [login, setLogin] = useState(!!initialMessage);
  const item = selected === null ? null : examples[selected];

  useEffect(() => {
    if (initialMessage) document.getElementById('member-login')?.scrollIntoView({ block: 'start' });
  }, [initialMessage]);

  function openLogin() {
    setLogin(true);
    requestAnimationFrame(() => document.getElementById('member-login')?.scrollIntoView({ block: 'start' }));
  }

  return <main className="welcome">
    <header className="welcome-nav"><a href="/login" className="welcome-brand"><BrandMark /><span>TASUKI</span></a><button onClick={openLogin}>会員ログイン <span aria-hidden="true">↗</span></button></header>
    <div className="welcome-intro">
      <section className="welcome-copy">
        <p className="welcome-kicker">仕事を頼む。仕事に出会う。</p>
        <h1>その日だけだった<br />商売の機会を、毎日へ。</h1>
        <p className="welcome-lead">TASUKIは、会員同士で仕事の依頼・受注・相談ができる招待制のビジネス掲示板です。</p>
        <p className="welcome-description">自分の得意が役立つ案件を探す。<br />任せたい仕事の相手を見つける。<br />スマホから、次の商談を始めませんか。</p>
        <a className="welcome-primary" href="#start">招待コードで登録する <span aria-hidden="true">→</span></a>
        <a className="welcome-try" href="#try">まずは操作を試す ↓</a>
        <p className="welcome-note">無料プランあり · 登録後、運営確認を経て利用開始</p>
      </section>
      <section className="welcome-demo" id="try" aria-label="TASUKIの操作体験">
        <div className="welcome-demo-top"><b>仕事の掲示板</b><span>サンプル体験</span></div>
        <div className="welcome-tabs" aria-label="体験する機能">
          <button aria-pressed={mode === 'find'} onClick={() => { setMode('find'); setSelected(null); setOffer(false); }}>仕事を探す</button>
          <button aria-pressed={mode === 'post'} onClick={() => setMode('post')}>仕事を依頼する</button>
        </div>
        <div className="welcome-demo-body">
          {mode === 'find' && !item && <>
            <p className="welcome-demo-hint">気になる案件をタップしてみてください。</p>
            {examples.map((entry, index) => <button className="welcome-job" key={entry.tag} onClick={() => { setSelected(index); setOffer(false); }}><span className="welcome-job-tag">発注先を募集 <span>／ {entry.tag}</span></span><strong>{entry.title}</strong><span className="welcome-job-bottom"><b>{entry.budget}</b><span>{entry.area} <i aria-hidden="true">↗</i></span></span></button>)}
          </>}
          {mode === 'find' && item && <div className="welcome-detail">
            <button className="welcome-back" onClick={() => { setSelected(null); setOffer(false); }}>← 案件一覧に戻る</button>
            <span className="welcome-job-tag">発注先を募集 ／ {item.tag}</span><h2>{item.title}</h2><p>{item.detail}</p>
            <dl><div><dt>予算の目安</dt><dd>{item.budget}</dd></div><div><dt>エリア</dt><dd>{item.area}</dd></div></dl>
            {!offer ? <><button className="welcome-primary" onClick={() => setOffer(true)}>オファーの流れを見る →</button><p className="welcome-note">得意を伝えて、具体的な商談のきっかけに。</p></> : <div className="welcome-conversation"><b>こんなふうに、仕事の話を始められます</b><p>{item.offer}</p><small>やり取りの例です。実際には送信されません。</small><a className="welcome-primary" href="#start">登録して、自分の仕事を探す →</a></div>}
          </div>}
          {mode === 'post' && <div className="welcome-post"><p className="welcome-demo-hint">依頼を入力して、掲載イメージを見てみましょう。</p><label htmlFor="demo-title">どんな仕事をお願いしたいですか？</label><textarea id="demo-title" rows={3} maxLength={100} value={draft} onChange={event => { setDraft(event.target.value); setPreview(false); }} /><button className="welcome-primary" disabled={!draft.trim()} onClick={() => setPreview(true)}>掲載イメージを見る →</button>{preview && <div className="welcome-post-result" aria-live="polite"><span className="welcome-job-tag">発注先を募集</span><h2>{draft}</h2><p>相談しながら決めたい ／ エリア応相談</p><b>依頼内容を見た会員から、オファーが届くきっかけに。</b><a href="#start">登録して依頼を投稿する →</a></div>}<p className="welcome-note">体験用です。入力内容は保存・公開されません。</p></div>}
        </div>
        <p className="welcome-demo-disclaimer">架空の案件・金額による操作イメージです。会員情報は表示していません。</p>
      </section>
    </div>
    <section className="welcome-benefits" aria-label="TASUKIでできること"><div><span>01 / 受注したい</span><h2>得意を、次の仕事に。</h2><p>依頼内容や予算を見て、自社で対応できる案件にオファーできます。</p></div><div><span>02 / 依頼したい</span><h2>探している相手に届く。</h2><p>任せたい仕事を投稿。条件を共有してから、具体的な話を進められます。</p></div><div><span>03 / つながったあとも</span><h2>話を、そのまま続ける。</h2><p>案件をきっかけにメッセージで相談。空いた時間に、スマホから確認できます。</p></div></section>
    <section className="welcome-start" id="start"><div><p className="welcome-kicker">次は、あなたの仕事で。</p><h2>つながりを、商売の機会に。</h2><p>招待コードを入力して登録へ。<br />Googleアカウントで登録後、運営確認を経てご利用いただけます。</p><small>無料プランあり。オファーなどの利用範囲はプランによって異なります。</small></div><form onSubmit={event => { event.preventDefault(); window.location.assign(`/join/${encodeURIComponent(invite)}`); }}><label htmlFor="welcome-invite">招待コード（8桁）</label><input id="welcome-invite" value={invite} onChange={event => setInvite(event.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 8))} placeholder="例：AB12CD34" pattern="[A-Za-z0-9]{8}" minLength={8} maxLength={8} autoCapitalize="characters" autoComplete="off" required /><button className="welcome-primary" type="submit">登録へ進む →</button><p className="welcome-note">コードをお持ちでない方は、招待してくれた会員にお尋ねください。</p></form></section>
    <section id="member-login" className="welcome-login"><button className="welcome-login-toggle" onClick={() => setLogin(!login)} aria-expanded={login} aria-controls="login-content">すでに会員の方はこちら <span>{login ? '−' : 'ログイン →'}</span></button><div id="login-content" hidden={!login}>{children}</div></section>
    <footer className="welcome-footer"><a href="/lp">TASUKIについて</a><a href="mailto:info@tasuki.club">お問い合わせ</a><span>© TASUKI</span><LegalLinks /></footer>
  </main>;
}
