import BrandMark from './BrandMark';
import LandingInvite from './LandingInvite';
import LandingMenu from './LandingMenu';
import { serviceName } from './brand';
import { planCatalog, yearlyYen, YEARLY_DISCOUNT, AD_DAILY_YEN } from './plan-catalog';
import { freeCampaign, campaignUntilLabel } from './campaign';
import { campaignPlan } from './entitlements';
import { AD_MIN_DAYS, AD_MAX_DAYS, placementSlots } from './ad-options';
import styles from './LandingPage.module.css';

function Confetti() {
  return <div className={styles.confetti} aria-hidden="true">
    <svg viewBox="0 0 160 640" preserveAspectRatio="none"><path fill="#bf63f3" d="M0 0h95l-20 55 48 32-35 52 33 25-52 39-69-22Z"/><path fill="#1868db" d="m0 205 69-16 44 68-55 16 32 73-90 19Z"/><path fill="#fca700" d="m0 366 58-28 51 82-38 25 34 63-105 24Z"/><path fill="#6a9a23" d="m0 530 88-39 42 82-53 32 21 35H0Z"/></svg>
    <svg viewBox="0 0 160 640" preserveAspectRatio="none"><path fill="#1868db" d="m160 0-92 0 32 69-48 36 46 72 62-23Z"/><path fill="#fca700" d="m160 157-70 15-34 70 46 28-17 47 75 23Z"/><path fill="#bf63f3" d="m160 335-91-32-31 85 55 27-34 47 101 35Z"/><path fill="#6a9a23" d="m160 508-60-20-47 82 48 30-14 40h73Z"/></svg>
  </div>;
}

function FeatureIcon({ kind }: { kind: 'search' | 'people' | 'message' }) {
  return <svg className={styles.featureIcon} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind === 'search' ? <><circle cx="14" cy="14" r="8"/><path d="m20 20 7 7"/></> : kind === 'people' ? <><circle cx="12" cy="10" r="4"/><path d="M4 27v-3a8 8 0 0 1 16 0v3M22 6a4 4 0 0 1 0 8M24 19a7 7 0 0 1 4 6v2"/></> : <><path d="M5 5h22v17H15l-7 6v-6H5Z"/><path d="M10 11h12M10 16h8"/></>}</svg>;
}

function ProductShowcase() {
  return <figure className={styles.productShowcase} aria-label="TASUKIの実際の画面">
    <figcaption className={styles.productCaption}><span aria-hidden="true"/>ACTUAL PRODUCT UI <b>デモデータ</b></figcaption>
    <div className={`${styles.productScreen} ${styles.productScreenBack}`}>
      <img src="/lp/tasuki-ui-mypage.jpg" width="960" height="1880" alt="TASUKIのマイページ画面"/>
    </div>
    <div className={`${styles.productScreen} ${styles.productScreenFront}`}>
      <img src="/lp/tasuki-ui-requests.jpg" width="960" height="1880" alt="TASUKIの仕事の掲示板画面"/>
    </div>
    <p className={styles.productNote}><span aria-hidden="true">●</span> 掲示板も会員情報も、ひとつの場所に。</p>
  </figure>;
}

export default function LandingPage({ error = '', pending = false }: { error?: string; pending?: boolean }) {
  const activeCampaign = campaignPlan({ plan: 'free', planPeriodEnd: '', campaignPlan: freeCampaign.plan, campaignPeriodEnd: freeCampaign.until }) === 'standard';
  return <main className={styles.page} id="top">
    <a href="#about" className={styles.skip}>本文へスキップ</a>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <a className={styles.brand} href="#top" aria-label="TASUKI トップ"><BrandMark/><b>{serviceName}</b></a>
        <nav className={styles.desktopNav} aria-label="メインナビゲーション"><a href="#about">TASUKIとは</a><a href="#how">使い方</a><a href="#plans">料金プラン</a><a href="#advertising">広告掲載</a></nav>
        <div className={styles.headerActions}><a className={styles.login} href="/api/auth/google/start">会員ログイン</a><a className={styles.headerCta} href="#start">無料で始める <span aria-hidden="true">↗</span></a></div>
        <LandingMenu/>
      </div>
    </header>
    <section className={styles.hero} aria-labelledby="lp-title">
      <Confetti/>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>守成クラブ会員向け・招待制マッチングサービス</p>
          <h1 id="lp-title">紹介が、<br/>次の商売に<br/>つながる。</h1>
          <p className={styles.heroLead}>あの人の「困った」に、あなたのつながりを。<br/>会員同士の紹介とオファーで、<br className={styles.mobileBreak}/>商売の可能性を広げよう。</p>
          <div className={styles.actions}><a className={styles.primary} href="#start">招待コードで始める <span aria-hidden="true">↗</span></a><a className={styles.secondary} href="#about">TASUKIを知る <span aria-hidden="true">↓</span></a></div>
          <p className={styles.fine}>無料プランあり · Googleアカウントで登録</p>
          {error && <p className={styles.notice} role={pending ? 'status' : 'alert'}>{error}</p>}
        </div>
        <ProductShowcase/>
      </div>
    </section>
    <div className={styles.introStrip}><span>守成クラブ会員向け</span><span>招待でつながる</span><span>紹介するオファーは無料</span></div>
    <section className={styles.about} id="about" aria-labelledby="about-title">
      <div className={styles.sectionTop}><span>01 / ABOUT TASUKI</span><span>会いたい人に、つながろう。</span></div>
      <div className={styles.aboutIntro}><h2 id="about-title">名刺交換の、その先へ。</h2><p>「お願いできる会社を探している」<br/>「この相談、あの人なら力になれそう」<br/>そんなきっかけを、例会のあともつなげる場所です。</p></div>
      <div className={styles.collage}>

        <article className={`${styles.story} ${styles.seek}`}><FeatureIcon kind="search"/><span className={styles.smallLabel}>探す・頼む</span><h3>こんな人、<br/>いませんか？</h3><p>案件や困りごとを投稿。<br/>会員のつながりに、相談してみよう。</p><span className={styles.sample}>たとえば：店舗の内装を相談したい</span></article>
        <article className={`${styles.story} ${styles.give}`}><FeatureIcon kind="people"/><span className={styles.smallLabel}>紹介する</span><h3>その人なら、<br/>知っています。</h3><p>仲間の得意を、必要としている人へ。<br/>知り合いを紹介するオファーは無料です。</p></article>
        <article className={`${styles.story} ${styles.offer}`}><FeatureIcon kind="message"/><span className={styles.smallLabel}>商売につなぐ</span><h3>その仕事、<br/>力になれます。</h3><p>自社で請け負うオファーも。<br/>スタンダードなら、自分の商売にも活用できます。</p><span className={styles.smallLabel}>STANDARD</span></article>
      </div>

    </section>
    <section className={styles.lavenderBand} aria-labelledby="give-title"><p className={styles.eyebrow}>GOOD CONNECTIONS. GREAT BUSINESS.</p><h2 id="give-title">あなたの「知っている」が、<br/>誰かの力になる。</h2><p>紹介は、商売をつなぐ最初の一歩。<br/>いつものつながりを、毎日の商売の力に。</p><a href="#start">仲間と一緒に始める <span aria-hidden="true">→</span></a></section>
    <section className={styles.how} id="how" aria-labelledby="how-title">
      <div className={styles.sectionTop}><span>02 / HOW TO JOIN</span><span>まずは、仲間からの招待で。</span></div>
      <div className={styles.howGrid}><div className={styles.howArt}><p className={styles.smallLabel}>YOUR NEXT CONNECTION</p><h3>仲間からの招待が、<br/>新しい商売の入口に。</h3><div className={styles.joinDiagram}><div><span>01</span><b>招待リンク</b><small>会員から受け取る</small></div><span aria-hidden="true">↓</span><div><span>02</span><b>Googleで登録</b><small>ご自身のアカウントで</small></div><span aria-hidden="true">↓</span><div><span>03</span><b>TASUKIを利用</b><small>案件を見る・仲間を紹介する</small></div></div></div><div className={styles.steps}><h2 id="how-title">つながる準備は、<br/>この3ステップ。</h2><ol>{[
        ['招待を受け取る', 'TASUKIを利用している会員から、招待リンクまたは8桁の招待コードを受け取ります。'],
        ['Googleで登録する', '招待ページで内容を確認し、ご自身のGoogleアカウントで登録します。'],
        ['さっそく、つながる', '登録後はすぐに利用できます。案件を見たり、知り合いを紹介したりするところから。'],
      ].map(([title, body], i) => <li key={title}><span>0{i + 1}</span><div><h3>{title}</h3><p>{body}</p></div></li>)}</ol><a href="#start" className={styles.primary}>招待コードを入力する <span aria-hidden="true">↗</span></a></div></div>
    </section>
    <section className={styles.plans} id="plans" aria-labelledby="plans-title">
      <div className={styles.sectionTop}><span>03 / MEMBERSHIP</span><span>紹介は無料。もっと使うならスタンダード。</span></div>
      <div className={styles.planHeading}><h2 id="plans-title">あなたのペースで、<br/>商売を広げよう。</h2></div>
      {activeCampaign && <div className={styles.campaign}><b>{freeCampaign.name}</b><p><strong>{campaignUntilLabel()}まで、スタンダード機能が無料。</strong><br/>期間中は契約なしで利用できます。以下は通常料金です。広告掲載は別料金です。</p></div>}
      <div className={styles.planCards}>
        <article className={styles.planCard}><span className={styles.smallLabel}>FREE</span><h3>まずは、つながる。</h3><div className={styles.price}>0<span>円</span></div><p>無料プラン</p><ul><li>掲示板の閲覧・会員検索</li><li>知り合いを紹介するオファー</li><li>案件の投稿は月1件まで</li></ul><p className={styles.planNote}>通常、届いたオファーの内容確認・返信と、自社で請け負うオファーにはスタンダードが必要です。</p><a href="#start" className={styles.secondary}>招待コードで始める ↗</a></article>
        <article className={`${styles.planCard} ${styles.standard}`}><span className={styles.smallLabel}>STANDARD</span><h3>もっと、商売につなぐ。</h3><div className={styles.price}>{planCatalog.standard.monthlyYen.toLocaleString('ja-JP')}<span>円 / 月</span></div><p>年払い {yearlyYen('standard').toLocaleString('ja-JP')}円 / 年 <b className={styles.discount}>{YEARLY_DISCOUNT * 100}%OFF</b></p><ul><li>無料プランの機能すべて</li><li>案件の投稿は何件でも</li><li>届いたオファーの内容確認・返信</li><li>自社で請け負うオファー</li></ul><a href="#start" className={styles.primary}>{activeCampaign ? '招待を受けて無料で試す' : '招待コードで始める'} ↗</a></article>
      </div>
      <div className={styles.ads} id="advertising"><div><span className={styles.smallLabel}>LET YOUR BUSINESS BE SEEN</span><h3>あなたの商売を、<br/>会員に届ける広告枠。</h3><p>掲載日数に応じた日割り料金。<br/>最短{AD_MIN_DAYS}日〜最長{AD_MAX_DAYS}日で掲載できます。</p></div><div className={styles.adPrices}><div><span>バナー広告 · {placementSlots('banner')}枠</span><b>{AD_DAILY_YEN.banner}円<small> / 日</small></b></div><div><span>掲示板上位 · {placementSlots('list')}枠</span><b>{AD_DAILY_YEN.list}円<small> / 日</small></b></div><p>出稿条件・空き枠は、ログイン後の広告申込画面でご確認ください。</p></div></div>
    </section>
    <section className={styles.start} id="start" aria-labelledby="start-title"><Confetti/><div className={styles.startInner}><div className={styles.startCopy}><p className={styles.eyebrow}>LET’S CONNECT</p><h2 id="start-title">次のご縁は、<br/>あなたの<br/>つながりから。</h2><p>仲間からの招待を受け取ったら、<br/>TASUKIで最初の一歩を。</p></div><div className={styles.startCard}><p className={styles.smallLabel}>INVITATION ONLY</p><h3>TASUKIを始める</h3><LandingInvite/><a className={styles.memberLogin} href="/api/auth/google/start">登録済みの方：Googleでログイン ↗</a></div></div></section>
    <footer className={styles.footer}><a className={styles.brand} href="#top"><BrandMark/><b>{serviceName}</b></a><p>人から人へ。商売のたすきをつなぐ。</p><nav aria-label="規約とお問い合わせ"><a href="/terms">利用規約</a><a href="/privacy">プライバシーポリシー</a><a href="/refund">返金・キャンセル</a><a href="/tokushoho">特定商取引法に基づく表記</a><a href="/support">お問い合わせ</a></nav><small>運営：株式会社ColourJam</small></footer>
  </main>;
}
