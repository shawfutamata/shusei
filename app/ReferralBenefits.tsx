'use client';

import { adsFreeNow, campaignUntilLabel } from './campaign';
import { rankNames, rankPerks, rankThresholds } from './rank-perks';
import styles from './ReferralBenefits.module.css';

export default function ReferralBenefits({ level, invitedCount, compact = false, onInvite, onDetails }: {
  level: number; invitedCount: number; compact?: boolean; onInvite?: () => void; onDetails: () => void;
}) {
  const nextLevel = Math.min(level + 1, rankNames.length);
  const remaining = Math.max(0, rankThresholds[nextLevel - 1] - invitedCount);
  const freeAds = adsFreeNow();
  // バナーは画像で訴求し、変わりうる人数と無料期間は定義から文字で添える。
  if (compact) return <section className={styles.bannerPanel} aria-label="仲間の招待とランク特典">
    <button type="button" className={styles.bannerLink} onClick={onInvite ?? onDetails}
      aria-label="仲間を招待して特典を解放。招待・特典を確認する">
      <img src="/banners/referral-benefits-v1.png" width="1536" height="1024"
        alt="TASUKI 紹介プログラム。仲間を招待して特典を解放！予算で絞り込み、広告費の割引も。招待した方の登録人数に応じて特典が増えます。" />
    </button>
    <div className={styles.bannerDetails}>
      <p className={styles.progress}>{level < rankNames.length
        ? <>あと<b>{remaining}人</b>の登録で <strong>{rankNames[nextLevel - 1]}</strong></>
        : <>現在 <strong>{rankNames[rankNames.length - 1]}</strong>・最高ランクです</>}</p>
      <p className={styles.bannerConditions}>招待リンク・コードからの会員登録が対象です。累計{rankThresholds[2]}人で予算の絞り込み・広告10%OFF、累計{rankThresholds[3]}人で広告30%OFF。割引は重複しません。</p>
      {freeAds && <p className={styles.bannerConditions}>{campaignUntilLabel()}までは全員の広告掲載料が無料。広告割引は無料期間終了後に適用されます。</p>}
      <button type="button" className={styles.bannerMore} onClick={onDetails}>ランク特典と条件を詳しく見る <span aria-hidden="true">›</span></button>
    </div>
  </section>;
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
