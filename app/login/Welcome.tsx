'use client';

import { useEffect, useState, type ReactNode } from 'react';
import BrandMark from '../BrandMark';
import LegalLinks from '../LegalLinks';
import { campaignRunning, campaignUntilLabel } from '../campaign';
import { planCatalog, yearlyYen, YEARLY_DISCOUNT } from '../plan-catalog';
import './welcome.css';

type IconName = 'search' | 'briefcase' | 'chat' | 'phone' | 'send' | 'check';
const campaignUntil = campaignUntilLabel();
function WelcomeIcon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></>,
    briefcase: <><rect x="3" y="7" width="18" height="14" rx="3" /><path d="M8 7V4h8v3M3 12c5 4 13 4 18 0M10 13h4" /></>,
    chat: <><path d="M21 11a8 8 0 0 1-8 8H7l-4 3V11a9 9 0 0 1 18 0Z" /><path d="M7 10h10M7 14h6" /></>,
    phone: <><rect x="6" y="2" width="12" height="20" rx="3" /><path d="M10 5h4M11 18h2" /></>,
    send: <><path d="m3 10 18-7-7 18-3-8-8-3Z M11 13 21 3" /></>,
    check: <><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></>,
  };
  return <svg className="welcome-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function Recording({ name, label }: { name: 'find' | 'post'; label: string }) {
  return <figure className="welcome-recording">
    {/* Actual browser captures of the public sample, with no member data. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/welcome/${name}.gif`} alt={label} width={520} height={700} loading="lazy" />
    <figcaption><span>指アイコンでタップ位置を案内</span><span className="welcome-recording-status"><i aria-hidden="true" />自動再生</span></figcaption>
  </figure>;
}

// Public examples only. Never load member posts or profiles before authentication.
const examples = [
  { tag: 'Web・デザイン', title: '新しいお店のホームページをお願いしたい', budget: '20〜40万円', area: 'オンライン可', detail: '店舗の雰囲気が伝わるサイトを作りたいです。構成の相談から制作まで、相談できる方を探しています。', offer: '店舗サイトの制作をしています。ご希望の雰囲気や公開時期を伺えますか？' },
  { tag: '清掃・設備', title: '店舗の定期清掃をお願いできる会社を探しています', budget: '月額5〜10万円', area: '東京都', detail: '営業前の時間帯に、床や水回りの定期清掃をお願いしたいです。まずは頻度や作業範囲をご相談させてください。', offer: '店舗の定期清掃に対応しています。場所とご希望の頻度を教えていただけますか？' },
  { tag: '動画・撮影', title: 'サービス紹介の短い動画を制作したい', budget: '10〜30万円', area: 'オンライン可', detail: 'WebサイトやSNSで使う紹介動画を検討しています。企画や撮影方法から相談できる方を探しています。', offer: 'サービス紹介動画を制作しています。伝えたい内容について、一度お話しできますか？' },
];

export default function Welcome({ children, initialMessage }: { children: ReactNode; initialMessage: string }) {
  const campaignActive = campaignRunning();
  const [mode, setMode] = useState<'find' | 'post'>('find');
  const [selected, setSelected] = useState<number | null>(null);
  const [offer, setOffer] = useState(false);
  const [draft, setDraft] = useState('お店のホームページを作れる方を探しています');
  const [preview, setPreview] = useState(false);
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
    <div className="welcome-hero"><div className="welcome-intro">
      <section className="welcome-copy">
        <p className="welcome-kicker"><WelcomeIcon name="briefcase" /> 経営者・事業者のビジネスマッチング</p>
        <h1>その日だけだった<br />商売の機会を、毎日へ。</h1>
        <p className="welcome-lead">あなたの「できます」と、<br />誰かの「お願いしたい」が出会う場所。</p>
        <p className="welcome-description">TASUKIなら、仕事を探すのも、依頼するのもスマホから。会員同士で直接つながり、次の商談を始められます。</p><div className="welcome-hero-points"><span><WelcomeIcon name="search" />仕事を見つける</span><span><WelcomeIcon name="send" />仕事を頼む</span><span><WelcomeIcon name="chat" />直接相談する</span></div>
        <a className="welcome-primary" href="#start">アカウントを作成 <span aria-hidden="true">→</span></a>
        <a className="welcome-try" href="#try">まずは操作を試す ↓</a>
        <p className="welcome-note">招待コード不要 · Googleアカウントで登録 · 運営確認後に利用開始</p>
      </section>
      <div className="welcome-keyvisual">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/welcome/connections-hero.webp" width={1536} height={1024} alt="仕事を探す人と頼む人のつながりを表す、青い二つの帯のオブジェ" fetchPriority="high" />
        <div className="welcome-visual-caption"><span>できる人。</span><BrandMark /><span>頼みたい人。</span></div>
      </div>
    </div></div>
    <section className="welcome-metrics" aria-labelledby="metrics-heading">
      <div className="welcome-section-heading"><p className="welcome-kicker">TASUKIでできること</p><h2 id="metrics-heading">仕事の機会を、<br />待つだけにしない。</h2></div>
      <div className="welcome-metric-grid">
        <article><span>受注のきっかけを増やす</span><strong className="metric-word">見つける</strong><h3>得意を活かせる仕事へ。</h3><p>依頼内容・予算・エリアを見て、自社に合う案件へオファーできます。</p></article>
        <article><span>発注先探しを進める</span><strong className="metric-word">頼める</strong><h3>探している相手を、会員へ。</h3><p>仕事や相談を掲示板へ投稿し、対応できる相手とつながれます。</p></article>
        <article><span>商談を前へ進める</span><strong className="metric-word">話せる</strong><h3>条件や進め方を、直接相談。</h3><p>オファーからメッセージへ進み、スマホで具体的なやり取りを始められます。</p></article>
      </div>
    </section>
    <section className="welcome-walkthrough" aria-labelledby="walkthrough-heading">
      <div className="welcome-section-heading"><p className="welcome-kicker">使い方が見える、操作ムービー。</p><h2 id="walkthrough-heading">次の仕事は、<br />こんな操作から始まります。</h2><p>操作の流れを短いムービーで自動再生します。</p></div>
      <article className="welcome-step"><div className="welcome-step-copy"><p className="welcome-step-number">STEP 01 <span>仕事を受けたい方へ</span></p><h3>「うちならできる」案件に、<br />自分からアプローチ。</h3><p>依頼内容・予算・エリアを見て、自社の得意が活きる仕事を探す。気になる案件から詳細を確認し、オファーへ進めます。</p><ul><li><WelcomeIcon name="check" />具体的な依頼を見てから提案できる</li><li><WelcomeIcon name="check" />条件を確かめて、商談を始められる</li></ul><a href="#try" onClick={() => { setMode('find'); setSelected(null); setOffer(false); }}>自分で操作してみる →</a></div><Recording name="find" label="案件を探してオファーの流れを見る" /></article>
      <article className="welcome-step reverse"><div className="welcome-step-copy"><p className="welcome-step-number">STEP 02 <span>仕事を頼みたい方へ</span></p><h3>任せたい仕事を投稿。<br />対応できる相手と、つながる。</h3><p>「誰にお願いしよう」と思ったら、まず依頼を掲示板へ。会員からのオファーをきっかけに、条件や進め方を相談できます。</p><ul><li><WelcomeIcon name="check" />仕事内容をまとめて伝えられる</li><li><WelcomeIcon name="check" />メッセージで具体的な相談へ進める</li></ul><a href="#try" onClick={() => setMode('post')}>依頼の掲載イメージを試す →</a></div><Recording name="post" label="依頼を入力して掲載イメージを見る" /></article>
      <p className="welcome-metric-note">録画は公開サンプルの操作です。架空の案件・金額を使用し、実際の投稿や送信は行っていません。</p>
    </section>
    <section className="welcome-features" aria-labelledby="features-heading"><div className="welcome-section-heading"><p className="welcome-kicker">FEATURES</p><h2 id="features-heading">仕事の出会いから相談まで。<br />TASUKIの主な機能</h2><p>受注も発注も、日々のやり取りも。スマホで使える機能をひとつに。</p></div><div className="welcome-feature-grid">
      {([
        ['search', '案件を探す', '業種・エリア・予算などを手がかりに、自社に合う案件を見つける。'],
        ['briefcase', '依頼を投稿', '発注先・協業先・相談相手など、探している相手を会員に伝える。'],
        ['send', 'オファー', '対応できる仕事に、自分の得意や提案を届けて商談のきっかけに。'],
        ['chat', 'メッセージ', 'つながった相手と、条件や進め方について直接やり取りする。'],
        ['check', '会員プロフィール', '会社や事業内容を伝え、どんな相手かを知ってもらう。'],
        ['phone', 'お気に入り', '気になる案件を保存して、あとから見返す。'],
      ] as [IconName, string, string][]).map(([icon, title, description]) => <article key={title}><div className="welcome-feature-art"><WelcomeIcon name={icon} /></div><div><h3>{title}</h3><p>{description}</p></div></article>)}
    </div><p className="welcome-feature-note">仕事を探すところから相談まで、スマホでひとつにつながります。</p></section>
    <section className="welcome-hands-on"><div className="welcome-section-heading"><p className="welcome-kicker">登録前に、触ってみよう。</p><h2>TASUKIの操作を、ここで体験。</h2><p>案件をタップしたり、依頼文を入力したり。実際の流れを試せます。</p></div>
      <section className="welcome-demo" id="try" aria-label="TASUKIの操作体験">
        <div className="welcome-demo-top"><b><WelcomeIcon name="briefcase" />仕事の掲示板</b><span>サンプル体験</span></div>
        <div className="welcome-tabs" aria-label="体験する機能">
          <button aria-pressed={mode === 'find'} onClick={() => { setMode('find'); setSelected(null); setOffer(false); }}><WelcomeIcon name="search" />仕事を探す</button>
          <button aria-pressed={mode === 'post'} onClick={() => setMode('post')}><WelcomeIcon name="send" />仕事を依頼する</button>
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
    </section>
    <section className="welcome-pricing" id="plans" aria-labelledby="pricing-heading">
      <div className="welcome-section-heading"><p className="welcome-kicker">PLANS &amp; CAMPAIGN</p><h2 id="pricing-heading">使い方を見てから、<br />プランを選べます。</h2><p>登録前にサービスの中身を確認できるから、自分の仕事に合うかを判断してから始められます。</p></div>
      {campaignActive && <div className="welcome-pricing-campaign">
        <div><span>{campaignUntil}まで</span><h3>年内は、全機能を完全無料で。</h3><p>通常はスタンダードで利用できる機能に加え、広告掲載料も0円。お申し込みもお支払いも必要ありません。</p></div>
        <div className="welcome-campaign-price"><small>通常 月額</small><s>{planCatalog.standard.monthlyYen.toLocaleString('ja-JP')}円</s><strong>0<em>円</em></strong><b>自動課金なし</b></div>
        <ul><li><WelcomeIcon name="check" />オファーの送受信</li><li><WelcomeIcon name="check" />新規メッセージ無制限</li><li><WelcomeIcon name="check" />案件投稿・会員検索</li><li><WelcomeIcon name="check" />バナー・掲示板上位広告</li></ul>
      </div>}
      <div className="welcome-regular-plans">
        <article><span>FREE</span><h3>無料プラン</h3><strong>0<small>円 / 月</small></strong><p>キャンペーン終了後も、基本機能を無料で利用できます。</p></article>
        <article><span>STANDARD</span><h3>スタンダード</h3><strong>{planCatalog.standard.monthlyYen.toLocaleString('ja-JP')}<small>円 / 月</small></strong><p>年払い {yearlyYen('standard').toLocaleString('ja-JP')}円（{YEARLY_DISCOUNT * 100}%OFF）。全機能を利用できます。</p></article>
      </div>
      <p className="welcome-pricing-note">キャンペーン終了後、自動で有料プランへ切り替わることはありません。スタンダードの継続を希望する場合だけ、ご自身でお申し込みいただきます。</p>
    </section>
    <section className="welcome-start" id="start"><div><p className="welcome-kicker"><WelcomeIcon name="check" />全機能無料キャンペーン</p><h2>つながりを、商売の機会に。</h2><p>招待コードは必要ありません。<br />Googleアカウントで登録後、運営確認を経てご利用いただけます。</p><small>{campaignUntil}まで全機能・広告掲載料が完全無料。終了後も自動課金はありません。</small></div><div className="welcome-signup"><a className="welcome-primary" href="/api/auth/google/start?signup=1"><GoogleMark />Googleで無料登録 <span aria-hidden="true">→</span></a><p className="welcome-note">登録後、運営確認が完了するとご利用いただけます。</p></div></section>
    <section id="member-login" className="welcome-login"><button className="welcome-login-toggle" onClick={() => setLogin(!login)} aria-expanded={login} aria-controls="login-content">すでに会員の方はこちら <span>{login ? '−' : 'ログイン →'}</span></button><div id="login-content" hidden={!login}>{children}</div></section>
    <footer className="welcome-footer"><a href="/lp">TASUKIについて</a><a href="mailto:info@tasuki.club">お問い合わせ</a><span>© TASUKI</span><LegalLinks /></footer>
  </main>;
}

function GoogleMark() {
  return <svg className="welcome-google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C7.9 41 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z"/></svg>;
}
