import BrandMark from './BrandMark';
import LandingInvite from './LandingInvite';
import { serviceName } from './brand';
import { planCatalog, yearlyYen, YEARLY_DISCOUNT, AD_DAILY_YEN } from './plan-catalog';
import { freeCampaign, campaignUntilLabel } from './campaign';
import { campaignPlan } from './entitlements';
import { AD_MIN_DAYS, AD_MAX_DAYS } from './ad-options';
import styles from './LandingPage.module.css';

function Ribbon({ className = '' }: { className?: string }) {
  // Decorative generated asset; dimensions reserve space without an image optimizer.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`${styles.ribbon} ${className}`} src="/lp/tasuki-ribbon.png" alt="" aria-hidden="true" width={1536} height={1024} />;
}
function Sticker({ kind, className = '' }: { kind: 'link' | 'spark' | 'message'; className?: string }) {
  return <span className={`${styles.sticker} ${styles[kind]} ${className}`} aria-hidden="true"><svg viewBox="0 0 100 100" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round">{kind === 'link' ? <><rect x="14" y="28" width="44" height="28" rx="14" transform="rotate(-35 36 42)"/><rect x="42" y="42" width="44" height="28" rx="14" transform="rotate(-35 64 56)"/><path d="M38 60 63 41"/></> : kind === 'spark' ? <path d="m50 10 8 28 27-12-18 25 23 16-29-2-6 26-12-25-25 14 14-26L10 41l29 1Z" fill="currentColor"/> : <><path d="M17 22h66v45H48L29 82V67H17Z"/><path d="M32 39h36M32 51h25"/></>}</svg></span>;
}

export default function LandingPage({ error = '', pending = false }: { error?: string; pending?: boolean }) {
  const activeCampaign = campaignPlan({ plan: 'free', planPeriodEnd: '', campaignPlan: freeCampaign.plan, campaignPeriodEnd: freeCampaign.until }) === 'standard';
  return <main className={styles.page} id="top">
    <a href="#about" className={styles.skip}>本文へスキップ</a>
    <div className={styles.marquee}><div><span>GOOD CONNECTIONS. GREAT BUSINESS.　 ✳　 つながりを、次の商売へ。　 ✳　 </span><span aria-hidden="true">GOOD CONNECTIONS. GREAT BUSINESS.　 ✳　 つながりを、次の商売へ。　 ✳　 </span><span aria-hidden="true">GOOD CONNECTIONS. GREAT BUSINESS.　 ✳　 つながりを、次の商売へ。　 ✳　 </span></div></div>
    <header className={styles.header}>
      <a className={styles.brand} href="#top" aria-label="TASUKI トップ"><BrandMark /><b>{serviceName}</b></a>
      <nav aria-label="メインナビゲーション"><a href="#about">TASUKIとは</a><a href="#how">使い方</a><a href="#plans">料金</a></nav>
      <a className={styles.login} href="/api/auth/google/start">会員ログイン <span aria-hidden="true">↗</span></a>
    </header>
    <section className={styles.hero} aria-labelledby="lp-title">
      <p className={styles.eyebrow}>守成クラブ会員向け・招待制マッチングサービス</p>
      <div className={styles.heroArt}><Ribbon /><h1 id="lp-title">{serviceName}</h1><Sticker kind="link"/><Sticker kind="spark"/><span className={styles.hello}>こんな人、<br/>探しています。</span></div>
      <div className={styles.heroCopy}><h2>紹介が、次の商売につながる。</h2><p>あの人の「困った」に、あなたのつながりを。<br/>会員同士の紹介とオファーで、商売の可能性を広げよう。</p>
      <div className={styles.actions}><a className={styles.primary} href="#start">招待コードで始める <span aria-hidden="true">↗</span></a><a className={styles.secondary} href="#about">TASUKIを知る <span aria-hidden="true">↓</span></a></div>
      <p className={styles.fine}>無料プランあり · Googleアカウントで登録</p>
      {error && <p className={styles.notice} role={pending ? 'status' : 'alert'}>{error}</p>}</div>
      <div className={styles.heroFoot}><span>人から人へ。商売のたすきをつなぐ。</span><span>SCROLL TO CONNECT ↓</span></div>
    </section>
    <section className={styles.about} id="about" aria-labelledby="about-title">
      <div className={styles.sectionTop}><span>01 / ABOUT TASUKI</span><span>会いたい人に、つながろう。</span></div>
      <div className={styles.aboutIntro}><h2 id="about-title">名刺交換の、その先へ。</h2><p>「お願いできる会社を探している」<br/>「この相談、あの人なら力になれそう」<br/>そんなきっかけを、例会のあともつなげる場所です。</p></div>
      <div className={styles.collage}>
        <Ribbon className={styles.aboutRibbon}/>
        <article className={`${styles.story} ${styles.seek}`}><span className={styles.smallLabel}>01　探す・頼む</span><h3>こんな人、<br/>いませんか？</h3><p>案件や困りごとを投稿。<br/>会員のつながりに、相談してみよう。</p><span className={styles.sample}>たとえば：店舗の内装を相談したい</span></article>
        <article className={`${styles.story} ${styles.give}`}><span className={styles.smallLabel}>02　紹介する</span><h3>その人なら、<br/>知っています。</h3><p>仲間の得意を、必要としている人へ。<br/>知り合いを紹介するオファーは無料です。</p><Sticker kind="link"/></article>
        <article className={`${styles.story} ${styles.offer}`}><span className={styles.smallLabel}>03　商売につなぐ</span><h3>その仕事、<br/>力になれます。</h3><p>自社で請け負うオファーも。<br/>スタンダードなら、自分の商売にも活用できます。</p><span className={styles.smallLabel}>STANDARD</span></article>
      </div>
      <p className={styles.aboutNote}>案件を探す。仲間を紹介する。オファーを届ける。<br/>いつものつながりを、毎日の商売の力に。</p>
    </section>
    <section className={styles.how} id="how" aria-labelledby="how-title">
      <div className={styles.sectionTop}><span>02 / HOW TO JOIN</span><span>まずは、仲間からの招待で。</span></div>
      <div className={styles.howGrid}><div className={styles.howArt}><Ribbon/><p className={styles.display} aria-hidden="true">LET’S<br/>CONNECT.</p><Sticker kind="message"/></div><div className={styles.steps}><h2 id="how-title">つながる準備は、<br/>この3ステップ。</h2><ol>{[
        ['招待を受け取る', 'TASUKIを利用している会員から、招待リンクまたは8桁の招待コードを受け取ります。'],
        ['Googleで登録する', '招待ページで内容を確認し、ご自身のGoogleアカウントで登録します。'],
        ['さっそく、つながる', '登録後はすぐに利用できます。案件を見たり、知り合いを紹介したりするところから。'],
      ].map(([title, body], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol><a href="#start" className={styles.primary}>招待コードを入力する <span aria-hidden="true">↗</span></a></div></div>
    </section>
    <section className={styles.plans} id="plans" aria-labelledby="plans-title">
      <div className={styles.sectionTop}><span>03 / MEMBERSHIP</span><span>紹介は無料。もっと使うならスタンダード。</span></div>
      <div className={styles.planHeading}><h2 id="plans-title">あなたのペースで、<br/>商売を広げよう。</h2><Sticker kind="spark"/></div>
      {activeCampaign && <div className={styles.campaign}><b>{freeCampaign.name}</b><p><strong>{campaignUntilLabel()}まで、スタンダード機能が無料。</strong><br/>期間中は契約なしで利用できます。以下は通常料金です。広告掲載は別料金です。</p></div>}
      <div className={styles.planCards}>
        <article className={styles.planCard}><span className={styles.smallLabel}>FREE</span><h3>まずは、つながる。</h3><div className={styles.price}>0<span>円</span></div><p>無料プラン</p><ul><li>掲示板の閲覧・会員検索</li><li>知り合いを紹介するオファー</li><li>案件の投稿は月1件まで</li></ul><p className={styles.planNote}>通常、届いたオファーの内容確認・返信と、自社で請け負うオファーにはスタンダードが必要です。</p><a href="#start" className={styles.secondary}>招待コードで始める ↗</a></article>
        <article className={`${styles.planCard} ${styles.standard}`}><span className={styles.smallLabel}>STANDARD</span><h3>もっと、商売につなぐ。</h3><div className={styles.price}>{planCatalog.standard.monthlyYen.toLocaleString('ja-JP')}<span>円 / 月</span></div><p>年払い {yearlyYen('standard').toLocaleString('ja-JP')}円 / 年 <b className={styles.discount}>{YEARLY_DISCOUNT * 100}%OFF</b></p><ul><li>無料プランの機能すべて</li><li>案件の投稿は何件でも</li><li>届いたオファーの内容確認・返信</li><li>自社で請け負うオファー</li></ul><a href="#start" className={styles.primary}>{activeCampaign ? '招待を受けて無料で試す' : '招待コードで始める'} ↗</a></article>
      </div>
      <div className={styles.ads}><div><span className={styles.smallLabel}>LET YOUR BUSINESS BE SEEN</span><h3>あなたの商売を、<br/>会員に届ける広告枠。</h3><p>掲載日数に応じた日割り料金。<br/>最短{AD_MIN_DAYS}日〜最長{AD_MAX_DAYS}日で掲載できます。</p></div><div className={styles.adPrices}><div><span>バナー広告 · 5枠</span><b>{AD_DAILY_YEN.banner}円<small> / 日</small></b></div><div><span>掲示板上位 · 3枠</span><b>{AD_DAILY_YEN.list}円<small> / 日</small></b></div><p>出稿条件・空き枠は、ログイン後の広告申込画面でご確認ください。</p></div></div>
    </section>
    <section className={styles.start} id="start" aria-labelledby="start-title"><div className={styles.sectionTop}><span>04 / YOUR NEXT CONNECTION</span><span>さあ、たすきをつなごう。</span></div><Ribbon/><Sticker kind="link"/><h2 id="start-title">次のご縁は、<br/>あなたのつながりから。</h2><div className={styles.startCard}><p className={styles.smallLabel}>INVITATION ONLY</p><h3>TASUKIを始める</h3><LandingInvite/><a className={styles.memberLogin} href="/api/auth/google/start">登録済みの方：Googleでログイン ↗</a></div></section>
    <footer className={styles.footer}><a className={styles.brand} href="#top"><BrandMark/><b>{serviceName}</b></a><p>人から人へ。商売のたすきをつなぐ。</p><nav aria-label="規約とお問い合わせ"><a href="/terms">利用規約</a><a href="/privacy">プライバシーポリシー</a><a href="/refund">返金・キャンセル</a><a href="/tokushoho">特定商取引法に基づく表記</a><a href="/support">お問い合わせ</a></nav><small>運営：株式会社ColourJam</small></footer>
  </main>;
}
