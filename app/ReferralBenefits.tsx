'use client';

import { adsFreeNow, campaignUntilLabel } from './campaign';
import { serviceName } from './brand';
import { ProfileIcon } from './MyPageIcons';
import PerkIcon from './PerkIcon';
import { adDiscountRate, rankNames, rankPerks, rankThresholds } from './rank-perks';
import styles from './ReferralBenefits.module.css';

type Props = {
  level: number; invitedCount: number; compact?: boolean; onInvite?: () => void; onDetails: () => void;
};

function ReferralBanner({ level, invitedCount, onInvite, onDetails }: Props) {
  // 実際のランクと特典の定義から組み立てる。取得できない値を最上位や0人として見せない。
  const hasRank = Number.isInteger(level) && level >= 1 && level <= rankNames.length;
  const hasCount = Number.isInteger(invitedCount) && invitedCount >= 0;
  const highest = hasRank && level === rankNames.length;
  const currentRank = hasRank ? rankNames[level - 1] : '';
  const nextLevel = hasRank ? Math.min(level + 1, rankNames.length) : null;
  const remaining = nextLevel && hasCount ? Math.max(0, rankThresholds[nextLevel - 1] - invitedCount) : null;
  const freeAds = adsFreeNow();
  const discount = hasRank ? Math.round(adDiscountRate(level) * 100) : 0;
  const preview = hasRank && level === 1;
  const perkKeys = hasRank && level >= 3 ? ['budget'] : ['extend', 'longtext'];
  const summaryPerks = hasRank ? perkKeys.flatMap(key => {
    const perk = rankPerks.find(item => item.key === key && !item.soon);
    return perk ? [perk] : [];
  }) : [];

  return <section className={styles.bannerPanel} aria-label="仲間の招待とランク特典">
    <div className={styles.bannerHero}>
      <p className={styles.bannerEyebrow}>{serviceName} 紹介プログラム</p>
      <h2>仲間を招待して、<br />{serviceName}をもっと便利に。</h2>
      <p className={styles.bannerTagline}>つながりが広がる。特典も広がる。</p>
      <div className={styles.bannerIllustration} aria-hidden="true">
        <span className={styles.connectionOne} /><span className={styles.connectionTwo} />
        <span className={styles.personTop}><ProfileIcon /></span>
        <span className={styles.personLeft}><ProfileIcon /></span>
        <span className={styles.personRight}><ProfileIcon /></span>
        <span className={styles.gift}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" focusable="false"><path d="M4 11h16v10H4zM3 7h18v4H3zM12 7v14" /><path d="M12 7H8a3 3 0 1 1 3-3l1 3Zm0 0h4a3 3 0 1 0-3-3l-1 3Z" /></svg></span>
      </div>
    </div>
    <div className={styles.bannerDetails}>
      {hasRank ? <>
        <div className={styles.bannerRankRow}>
          <div className={styles.bannerRank}><PerkIcon perk="crest" /><div><span>現在のランク</span><strong>{currentRank}</strong></div></div>
          {highest && <span className={styles.rankAchieved}><span aria-hidden="true">✓</span>最高ランク達成</span>}
        </div>
        {!highest && <p className={styles.bannerProgress}>{remaining !== null
          ? <>あと<b>{remaining}人</b>の登録で <strong>{rankNames[nextLevel! - 1]}</strong></>
          : '招待人数を確認できません。招待画面でご確認ください。'}</p>}
        <p className={styles.perksLabel}>{preview ? `${rankNames[1]}で使える特典` : '現在の特典'}</p>
        <ul className={styles.bannerPerks}>
          {summaryPerks.map(perk => <li key={perk.key}><span className={preview ? styles.perkPending : styles.perkCheck} aria-hidden="true">{preview ? '○' : '✓'}</span><span>{perk.label}</span></li>)}
          {discount > 0 && <li><span className={styles.perkCheck} aria-hidden="true">✓</span><span>広告{discount}% OFF{freeAds && <small>無料期間終了後</small>}</span></li>}
        </ul>
      </> : <p className={styles.bannerUnavailable}>ランク情報を確認できません。招待画面でご確認ください。</p>}
      {onInvite && <button type="button" className={styles.bannerInvite} onClick={onInvite}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d="m22 2-7 20-4-9-9-4 20-7ZM22 2 11 13" /></svg>
        招待リンクを共有
      </button>}
      <button type="button" className={styles.bannerMore} onClick={onDetails}>特典と条件を見る <span aria-hidden="true">›</span></button>
    </div>
    {freeAds && <p className={styles.bannerCampaign}>広告掲載は{campaignUntilLabel()}まで無料</p>}
  </section>;
}

export default function ReferralBenefits({ level, invitedCount, compact = false, onInvite, onDetails }: Props) {
  const nextLevel = Math.min(level + 1, rankNames.length);
  const remaining = Math.max(0, rankThresholds[nextLevel - 1] - invitedCount);
  const freeAds = adsFreeNow();
  if (compact) return <ReferralBanner level={level} invitedCount={invitedCount} onInvite={onInvite} onDetails={onDetails} />;
  return <section className={styles.panel} aria-label="仲間の招待とランク特典">
    <p className={styles.eyebrow}>仲間を紹介して、できることをもっと。</p>
    <h2>{compact ? '招待で広がる、あなたの特典' : '仲間が増えると、ランクもアップ'}</h2>
    <p className={styles.progress}>{level < rankNames.length
      ? <>あと<b>{remaining}人</b>の登録で <strong>{rankNames[nextLevel - 1]}</strong></>
      : <>現在 <strong>{rankNames[rankNames.length - 1]}</strong>・最高ランクです</>}</p>
    {compact ? <p className={styles.summary}>募集の延長、写真の複数枚投稿、動画など。招待した方の登録人数に応じて、使える特典が増えます。</p>
      : <><p className={styles.summary}>あなたの招待リンク・コードを使って会員登録した方が対象です。リンクを送るだけでは人数に含まれません。</p>
        <ol className={styles.tiers}>{rankNames.slice(1).map((name, index) => {
          const tierLevel = index + 2;
          return <li key={name}><div className={styles.tierHeading}><strong>{name}</strong><span>累計{rankThresholds[tierLevel - 1]}人の登録</span></div>
            <ul>{rankPerks.filter(perk => perk.minLevel === tierLevel && !perk.soon).map(perk => <li key={perk.key}>{perk.label}{perk.webOnly && freeAds ? '（広告無料期間の終了後）' : ''}</li>)}</ul>
            <small>{level >= tierLevel ? '到達済み' : `あと${Math.max(0, rankThresholds[tierLevel - 1] - invitedCount)}人の登録で到達`}</small>
          </li>;
        })}</ol>
        {freeAds && <p className={styles.note}>{campaignUntilLabel()}までは、ランクにかかわらず広告掲載料が無料です。広告割引は無料期間終了後に適用され、10%と30%の割引は重複しません。</p>}
        <p className={styles.note}>ランクの判定は、案件への「知り合いの紹介（リファラル）」の件数とは別です。特典の詳しい条件は下のボタンから確認できます。</p>
      </>}
    <div className={styles.actions}>{onInvite && <button type="button" onClick={onInvite}>招待リンクを確認する <span aria-hidden="true">›</span></button>}
      <button type="button" className={styles.secondary} onClick={onDetails}>ランク特典を詳しく見る</button></div>
  </section>;
}
