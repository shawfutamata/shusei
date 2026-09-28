'use client';

import { useEffect, useState, type ReactNode } from 'react';
import BrandMark from '../BrandMark';
import LegalLinks from '../LegalLinks';
import { campaignRunning, campaignUntilLabel } from '../campaign';
import { planCatalog, yearlyYen, YEARLY_DISCOUNT } from '../plan-catalog';
import './welcome.css';

type IconName = 'search' | 'briefcase' | 'chat' | 'phone' | 'send' | 'check';
const campaignUntil = campaignUntilLabel();
const faqItems = [
  { question: 'TASUKIはどんなサービスですか？', answer: '経営者・事業者が、仕事を探す、依頼を投稿する、会員を探す、オファーや紹介を送る、メッセージで相談するといった商談のきっかけをつくれるビジネスマッチングサービスです。' },
  { question: 'アカウント登録に招待コードは必要ですか？', answer: 'このLPから登録する場合、招待コードは必要ありません。Googleアカウントで登録し、運営確認が完了すると利用を開始できます。' },
  { question: '登録後、すぐに利用できますか？', answer: '安心して利用できる場を保つため、登録後に運営確認を行います。確認が完了すると、掲示板や会員検索などの機能を利用できます。' },
  { question: '全機能無料キャンペーンでは何が使えますか？', answer: `${campaignUntil}までは、通常のスタンダードプランで提供するオファーの送受信、新規メッセージ無制限、案件投稿、会員検索などの全機能と広告掲載を無料で利用できます。` },
  { question: 'キャンペーン終了後、自動で課金されますか？', answer: '自動で有料プランに切り替わることはありません。キャンペーン終了後も無料プランを利用でき、スタンダードを希望する場合だけご自身で申し込みます。' },
  { question: '無料プランでは何ができますか？', answer: '掲示板の閲覧、会員検索、リファラル、案件投稿、メッセージの返信などを利用できます。はじめての相手への新規メッセージは月3人までです。オファーの送受信はスタンダードで利用できます。' },
  { question: 'スマートフォンから利用できますか？', answer: 'はい。スマートフォンのブラウザに合わせた画面で、案件の閲覧や投稿、会員検索、メッセージなどを利用できます。' },
  { question: 'このページのデモで入力した内容は公開されますか？', answer: '公開されません。デモで入力した内容は保存・送信されず、表示される案件や会社名も操作体験用のサンプルです。' },
];
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

function FeatureArt({ name }: { name: IconName }) {
  return <svg className="welcome-feature-illustration" viewBox="0 0 240 140" fill="none" aria-hidden="true">
    {name === 'search' && <>
      <rect className="art-card art-shadow" x="42" y="28" width="156" height="92" rx="13" />
      <rect className="art-soft" x="57" y="42" width="126" height="18" rx="9" />
      <circle className="art-blue" cx="70" cy="51" r="5" /><path className="art-line" d="M81 48h56M81 54h38" />
      <rect className="art-paper" x="57" y="69" width="126" height="16" rx="6" /><rect className="art-paper" x="57" y="91" width="126" height="16" rx="6" />
      <circle className="art-accent" cx="169" cy="77" r="4" /><circle className="art-mint" cx="169" cy="99" r="4" />
      <circle className="art-focus" cx="180" cy="42" r="20" /><path className="art-focus-line" d="m194 56 13 13" />
    </>}
    {name === 'briefcase' && <>
      <rect className="art-card art-shadow" x="51" y="22" width="138" height="104" rx="13" />
      <rect className="art-soft" x="67" y="39" width="78" height="9" rx="4.5" /><rect className="art-line-fill" x="67" y="56" width="106" height="6" rx="3" /><rect className="art-line-fill" x="67" y="69" width="89" height="6" rx="3" />
      <rect className="art-paper" x="67" y="86" width="49" height="24" rx="7" /><rect className="art-blue" x="123" y="86" width="50" height="24" rx="7" />
      <path className="art-white-line" d="M138 98h20M148 93v10" />
      <circle className="art-accent" cx="180" cy="29" r="13" /><path className="art-white-line" d="m175 29 4 4 7-8" />
    </>}
    {name === 'send' && <>
      <rect className="art-card art-shadow" x="39" y="38" width="142" height="82" rx="13" />
      <circle className="art-soft" cx="59" cy="59" r="10" /><path className="art-line" d="M76 55h63M76 63h46" />
      <rect className="art-paper" x="53" y="79" width="93" height="24" rx="8" /><path className="art-line" d="M65 88h54M65 95h35" />
      <path className="art-plane" d="m145 22 59 22-30 10-11 31-18-63Z" /><path className="art-plane-line" d="m163 53 41-31-30 32" />
      <circle className="art-mint" cx="183" cy="102" r="13" /><path className="art-white-line" d="m177 102 4 4 8-9" />
    </>}
    {name === 'chat' && <>
      <rect className="art-card art-shadow" x="49" y="24" width="142" height="102" rx="14" />
      <circle className="art-blue" cx="72" cy="49" r="11" /><path className="art-line" d="M91 45h65M91 53h45" />
      <path className="art-bubble-soft" d="M67 70h76a9 9 0 0 1 9 9v10a9 9 0 0 1-9 9H94l-14 10 3-10H67a9 9 0 0 1-9-9V79a9 9 0 0 1 9-9Z" />
      <path className="art-line" d="M76 80h54M76 88h39" />
      <path className="art-bubble-blue" d="M139 91h42a9 9 0 0 1 9 9v7a9 9 0 0 1-9 9h-19l-9 7 2-7h-16a9 9 0 0 1-9-9v-7a9 9 0 0 1 9-9Z" />
      <path className="art-white-line" d="M145 102h28M145 108h19" />
    </>}
    {name === 'check' && <>
      <rect className="art-card art-shadow" x="48" y="25" width="144" height="104" rx="14" />
      <rect className="art-blue" x="48" y="25" width="144" height="31" rx="14" /><path className="art-blue" d="M48 42h144v14H48z" />
      <circle className="art-avatar" cx="82" cy="78" r="19" /><circle className="art-paper" cx="82" cy="72" r="7" /><path className="art-paper-fill" d="M68 91c3-9 25-9 28 0" />
      <path className="art-line" d="M112 72h55M112 81h42" /><rect className="art-soft" x="112" y="93" width="43" height="15" rx="7.5" />
      <circle className="art-mint" cx="177" cy="39" r="13" /><path className="art-white-line" d="m171 39 4 4 8-9" />
    </>}
    {name === 'phone' && <>
      <rect className="art-card art-card-back" x="38" y="36" width="130" height="72" rx="12" />
      <rect className="art-card art-shadow" x="60" y="24" width="142" height="88" rx="13" />
      <rect className="art-soft" x="76" y="40" width="76" height="10" rx="5" /><path className="art-line" d="M76 62h92M76 72h68M76 88h48" />
      <path className="art-heart" d="M173 58c-13-15-31 5 0 28 31-23 13-43 0-28Z" />
      <circle className="art-accent" cx="57" cy="105" r="13" /><path className="art-white-line" d="m51 105 4 4 8-9" />
    </>}
  </svg>;
}

function Recording({ name, label }: { name: 'find' | 'post'; label: string }) {
  return <figure className="welcome-recording">
    {/* Actual browser captures of the public sample, with no member data. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={`/welcome/${name}.gif`} alt={label} width={520} height={700} loading="lazy" />
  </figure>;
}

// Public examples only. Never load member posts or profiles before authentication.
const examples = [
  { kind: '発注先', tag: '清掃・クリーニング', title: '店舗の定期清掃をお願いできる会社を探しています', budget: '月額5〜10万円（3店舗ぶん）', area: '東京都', detail: '都内3店舗の床とトイレの清掃を、週1回でお願いできる会社を探しています。閉店後の作業になります。まずは1店舗から試させていただけると助かります。', offer: '店舗の定期清掃に対応しています。店舗の場所とご希望の曜日を伺えますか？', image: '/samples/cleaning-thumb.webp', imageLarge: '/samples/cleaning.webp', company: 'サンプル商事株式会社', response: 'オファー2件・紹介1件' },
  { kind: '協業先', tag: '内装・リフォーム', title: 'オフィス移転を一緒に進めてくれる内装会社を探しています', budget: '300〜500万円', area: '東京都', detail: '来春に事務所を移転します。引越しの手配はこちらで進めますが、レイアウトの設計と内装工事をお願いできる方を探しています。20名ほどの規模です。', offer: 'オフィス内装の設計・施工に対応しています。移転時期と候補物件についてお話を伺えますか？', image: '/samples/moving-thumb.webp', imageLarge: '/samples/moving.webp', company: 'サンプル製作所', response: 'オファー1件・紹介3件' },
  { kind: '相談相手', tag: 'イベント企画・運営', title: '創立20周年の記念パーティーについて相談させてください', budget: '相談して決めたい', area: '東京都', detail: '来年で創立20周年になります。取引先を80名ほどお招きしての式を考えていて、会場とお食事の手配をどう進めればよいか、経験のある方にお話を伺いたいです。', offer: '企業イベントの企画・運営をしています。人数と開催時期を伺い、会場選びからご提案できます。', image: '/samples/catering-thumb.webp', imageLarge: '/samples/catering.webp', company: '株式会社サンプル工業', response: '紹介2件' },
];

export default function Welcome({ children, initialMessage }: { children: ReactNode; initialMessage: string }) {
  const campaignActive = campaignRunning();
  const [mode, setMode] = useState<'find' | 'post'>('find');
  const [selected, setSelected] = useState<number | null>(null);
  const [offer, setOffer] = useState(false);
  const [draft, setDraft] = useState(examples[0].title);
  const [postSample, setPostSample] = useState<number | null>(0);
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
      ] as [IconName, string, string][]).map(([icon, title, description]) => <article key={title}><div className="welcome-feature-art"><FeatureArt name={icon} /></div><div><h3>{title}</h3><p>{description}</p></div></article>)}
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
            {examples.map((entry, index) => <button className="welcome-job" key={entry.tag} onClick={() => { setSelected(index); setOffer(false); }}><span className="welcome-job-card"><span><span className="welcome-job-tag">{entry.kind} <em>サンプル</em><span>／ {entry.tag}</span></span><strong>{entry.title}</strong><span className="welcome-job-bottom"><b>{entry.budget}</b><span>{entry.area} <i aria-hidden="true">↗</i></span></span></span>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={entry.image} alt="" /></span><small className="welcome-job-meta">{entry.company}<span>{entry.response}</span></small></button>)}
          </>}
          {mode === 'find' && item && <div className="welcome-detail">
            <button className="welcome-back" onClick={() => { setSelected(null); setOffer(false); }}>← 案件一覧に戻る</button>
            {/* eslint-disable-next-line @next/next/no-img-element */}<img className="welcome-detail-image" src={item.imageLarge} alt="" />
            <span className="welcome-job-tag">{item.kind} <em>サンプル</em> ／ {item.tag}</span><h2>{item.title}</h2><p>{item.detail}</p>
            <dl><div><dt>予算の目安</dt><dd>{item.budget}</dd></div><div><dt>エリア</dt><dd>{item.area}</dd></div></dl>
            <p className="welcome-detail-author"><b>{item.company}</b><span>{item.response}</span></p>
            {!offer ? <><button className="welcome-primary" onClick={() => setOffer(true)}>オファーの流れを見る →</button><p className="welcome-note">得意を伝えて、具体的な商談のきっかけに。</p></> : <div className="welcome-conversation"><b>こんなふうに、仕事の話を始められます</b><p>{item.offer}</p><small>やり取りの例です。実際には送信されません。</small><a className="welcome-primary" href="#start">登録して、自分の仕事を探す →</a></div>}
          </div>}
          {mode === 'post' && <div className="welcome-post"><p className="welcome-demo-hint">公開用のサンプル案件を選ぶか、自由に入力して掲載カードを作れます。</p><div className="welcome-post-presets"><span>サンプル案件から試す</span><div>{examples.map((entry, index) => <button className={postSample === index ? 'active' : ''} key={entry.tag} onClick={() => { setPostSample(index); setDraft(entry.title); setPreview(false); }}>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={entry.image} alt="" /><span>{entry.kind}<b>{entry.title}</b></span></button>)}</div></div><label htmlFor="demo-title">どんな仕事をお願いしたいですか？</label><textarea id="demo-title" rows={3} maxLength={100} value={draft} onChange={event => { setDraft(event.target.value); setPostSample(null); setPreview(false); }} /><div className="welcome-post-fields"><span><small>募集する相手</small><b>{postSample === null ? '相談相手' : examples[postSample].kind}</b></span><span><small>予算</small><b>{postSample === null ? '相談して決めたい' : examples[postSample].budget}</b></span><span><small>エリア</small><b>{postSample === null ? 'エリア応相談' : examples[postSample].area}</b></span></div><button className="welcome-primary" disabled={!draft.trim()} onClick={() => setPreview(true)}>掲載イメージを見る →</button>{preview && <div className="welcome-post-result" aria-live="polite">{postSample !== null && <>{/* eslint-disable-next-line @next/next/no-img-element */}<img src={examples[postSample].imageLarge} alt="" /></>}<span className="welcome-job-tag">{postSample === null ? '相談相手' : examples[postSample].kind} <em>サンプル</em></span><h2>{draft}</h2><p>{postSample === null ? '相談して決めたい ／ エリア応相談' : `${examples[postSample].budget} ／ ${examples[postSample].area}`}</p><b>依頼内容を見た会員から、オファーが届くきっかけに。</b><a href="#start">登録して依頼を投稿する →</a></div>}<p className="welcome-note">体験用です。入力内容は保存・公開されません。</p></div>}
        </div>
        <p className="welcome-demo-disclaimer">公開用のサンプル案件による操作イメージです。実在する会員の投稿・情報は表示していません。</p>
      </section>
    </section>
    <section className="welcome-pricing" id="plans" aria-labelledby="pricing-heading">
      <div className="welcome-section-heading"><p className="welcome-kicker">PLANS &amp; CAMPAIGN</p><h2 id="pricing-heading">使い方を見てから、<br />プランを選べます。</h2><p>登録前にサービスの中身を確認できるから、自分の仕事に合うかを判断してから始められます。</p></div>
      {campaignActive && <div className="welcome-pricing-campaign">
        <div><span>{campaignUntil}まで</span><h3>年内は、全機能を完全無料で。</h3><p>通常はスタンダードで利用できる機能に加え、広告掲載料も0円。お申し込みもお支払いも必要ありません。</p></div>
        <div className="welcome-campaign-price"><small>通常 月額</small><s>{planCatalog.standard.monthlyYen.toLocaleString('ja-JP')}円</s><strong>0<em>円</em></strong><b>自動課金なし</b></div>
        <ul><li><WelcomeIcon name="check" />オファーの送受信</li><li><WelcomeIcon name="check" />新規メッセージ無制限</li><li><WelcomeIcon name="check" />案件投稿・会員検索</li><li><WelcomeIcon name="check" />バナー・掲示板上位広告</li></ul>
      </div>}
      <div className="welcome-plan-table-wrap">
        <table className="welcome-plan-table">
          <caption>プランでできること</caption>
          <thead><tr><th scope="col">できること</th><th scope="col">無料</th><th scope="col" className="is-standard">スタンダード{campaignActive && <em>年内無料</em>}</th></tr></thead>
          <tbody>
            <tr><th scope="row"><b>掲示板を見る</b></th><td><span aria-label="使えます">○</span></td><td className="is-standard"><span aria-label="使えます">○</span></td></tr>
            <tr><th scope="row"><b>会員を探す</b><small>業種・エリア</small></th><td><span aria-label="使えます">○</span></td><td className="is-standard"><span aria-label="使えます">○</span></td></tr>
            <tr><th scope="row"><b>リファラルを送る</b><small>知り合いの紹介</small></th><td><span aria-label="使えます">○</span></td><td className="is-standard"><span aria-label="使えます">○</span></td></tr>
            <tr><th scope="row"><b>案件の投稿</b></th><td><em>何件でも</em></td><td className="is-standard"><em>何件でも</em></td></tr>
            <tr><th scope="row"><b>オファーを受け取る</b><small>中身を読む・返事する</small></th><td className="is-no"><span aria-label="使えません">×</span></td><td className="is-standard"><span aria-label="使えます">○</span></td></tr>
            <tr><th scope="row"><b>オファーを送る</b><small>自社で請け負う</small></th><td className="is-no"><span aria-label="使えません">×</span></td><td className="is-standard"><span aria-label="使えます">○</span></td></tr>
            <tr><th scope="row"><b>メッセージを送る</b><small>はじめての相手へ</small></th><td><em>月3人まで</em></td><td className="is-standard"><em>何人でも</em></td></tr>
            <tr><th scope="row"><b>メッセージの返事</b><small>一度話した相手へ</small></th><td><span aria-label="使えます">○</span></td><td className="is-standard"><span aria-label="使えます">○</span></td></tr>
          </tbody>
          <tfoot><tr><th scope="row"><b>通常料金</b><small>キャンペーン終了後</small></th><td><strong>0<small>円 / 月</small></strong></td><td className="is-standard"><strong>{planCatalog.standard.monthlyYen.toLocaleString('ja-JP')}<small>円 / 月</small></strong><small className="welcome-plan-yearly">年払い {yearlyYen('standard').toLocaleString('ja-JP')}円<br />（{YEARLY_DISCOUNT * 100}%OFF）</small></td></tr></tfoot>
        </table>
      </div>
      <p className="welcome-pricing-note">キャンペーン終了後、自動で有料プランへ切り替わることはありません。スタンダードの継続を希望する場合だけ、ご自身でお申し込みいただきます。</p>
    </section>
    <section className="welcome-faq" aria-labelledby="faq-heading">
      <div className="welcome-section-heading"><p className="welcome-kicker">FAQ</p><h2 id="faq-heading">よくある質問</h2><p>登録や料金、利用方法についての疑問にお答えします。</p></div>
      <div className="welcome-faq-list">
        {faqItems.map((item, index) => <details key={item.question} open={index === 0}>
          <summary><span>Q</span>{item.question}<i aria-hidden="true" /></summary>
          <div><span>A</span><p>{item.answer}</p></div>
        </details>)}
      </div>
      <p className="welcome-faq-contact">解決しない場合は、<a href="mailto:info@tasuki.club">info@tasuki.club</a> までお問い合わせください。</p>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqItems.map(item => ({ '@type': 'Question', name: item.question, acceptedAnswer: { '@type': 'Answer', text: item.answer } })) }) }} />
    </section>
    <section className="welcome-start" id="start"><div><p className="welcome-kicker"><WelcomeIcon name="check" />全機能無料キャンペーン</p><h2>つながりを、商売の機会に。</h2><p>招待コードは必要ありません。<br />Googleアカウントで登録後、運営確認を経てご利用いただけます。</p><small>{campaignUntil}まで全機能・広告掲載料が完全無料。終了後も自動課金はありません。</small></div><div className="welcome-signup"><a className="welcome-primary" href="/api/auth/google/start?signup=1"><GoogleMark />Googleで無料登録 <span aria-hidden="true">→</span></a><p className="welcome-note">登録後、運営確認が完了するとご利用いただけます。</p></div></section>
    <section id="member-login" className="welcome-login"><button className="welcome-login-toggle" onClick={() => setLogin(!login)} aria-expanded={login} aria-controls="login-content">すでに会員の方はこちら <span>{login ? '−' : 'ログイン →'}</span></button><div id="login-content" hidden={!login}>{children}</div></section>
    <footer className="welcome-footer"><a href="/lp">TASUKIについて</a><a href="mailto:info@tasuki.club">お問い合わせ</a><span>© TASUKI</span><LegalLinks /></footer>
  </main>;
}

function GoogleMark() {
  return <svg className="welcome-google-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#4285F4" d="M45.1 24.5c0-1.6-.1-3.1-.4-4.5H24v8.5h11.8c-.5 2.7-2.1 5-4.4 6.6v5.5h7.1c4.2-3.8 6.6-9.5 6.6-16.1z"/><path fill="#34A853" d="M24 46c6 0 11-2 14.5-5.4l-7.1-5.5c-2 1.3-4.5 2.1-7.4 2.1-5.7 0-10.6-3.9-12.3-9.1H4.4v5.7C7.9 41 15.4 46 24 46z"/><path fill="#FBBC05" d="M11.7 28.1c-.4-1.3-.7-2.7-.7-4.1s.2-2.8.7-4.1v-5.7H4.4C2.9 17.1 2 20.4 2 24s.9 6.9 2.4 9.8l7.3-5.7z"/><path fill="#EA4335" d="M24 10.8c3.2 0 6.1 1.1 8.4 3.3l6.3-6.3C34.9 4.2 30 2 24 2 15.4 2 7.9 7 4.4 14.2l7.3 5.7c1.7-5.2 6.6-9.1 12.3-9.1z"/></svg>;
}
