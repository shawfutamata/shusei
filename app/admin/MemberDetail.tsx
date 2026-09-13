'use client';

import { useEffect, useState } from 'react';
import type { AdminMemberDetail } from '@/db/admin';
import { placementName } from '@/app/ad-options';
import { revenueBands } from '@/app/profile-options';

/**
 * 会員1人ぶんの詳細。一覧の名前を押すと、この板がかぶさって出る。
 *
 * **並べる順は「運営が知りたい順」。** 上から
 *   1. 続いているか（使った日・連続・カレンダー）
 *   2. 場に何を返したか（投稿・オファー・紹介・招待）
 *   3. お金（プランの出どころ・広告）
 * の順で、下へ行くほど細かくなる。
 *
 * **出さないもの**: メッセージとオファーの中身。数だけを出す。
 * 運営が読める作りにすると、会員にそう伝えなければならなくなる。
 */
export default function MemberDetail({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const [detail, setDetail] = useState<AdminMemberDetail | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setDetail(null); setError('');
    fetch(`/api/admin/members/${encodeURIComponent(memberId)}`)
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('読み込めませんでした')))
      .then((data) => { if (alive) setDetail(data as AdminMemberDetail); })
      .catch(() => { if (alive) setError('読み込めませんでした。画面を開き直してください。'); });
    return () => { alive = false; };
  }, [memberId]);

  // Escで閉じられるようにする。板が画面いっぱいに出るので、
  // 戻る道が「閉じる」ボタンひとつだけだと行き止まりに見える。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return <div className="mdetail-backdrop" role="dialog" aria-modal="true" aria-label="会員の詳細">
    <section className="mdetail">
      <header className="mdetail-head">
        <button className="mdetail-close" onClick={onClose} aria-label="閉じる">×</button>
        {detail
          ? <>
            <span className="mdetail-face">
              {detail.avatarKey
                // eslint-disable-next-line @next/next/no-img-element -- 顔写真はアプリ自身が配信している
                ? <img src={`/api/avatar/${detail.id}?v=${detail.avatarVersion}`} alt="" />
                : <i>{(detail.displayName || '?').slice(0, 1)}</i>}
            </span>
            <div className="mdetail-who">
              <h2>{detail.displayName || '(名前なし)'}</h2>
              <p>{[detail.positionTitle, detail.company].filter(Boolean).join('｜') || '会社名なし'}</p>
              <p className="mdetail-mail">{detail.email}</p>
            </div>
            <ul className="mdetail-chips">
              <li className={detail.canUse ? 'is-on' : 'is-off'}>{detail.canUse ? '利用中' : '停止中'}</li>
              <li className="is-rank">{detail.rank}</li>
              <li className={detail.plan === 'standard' ? 'is-paid' : ''}>
                {detail.plan === 'standard' ? 'スタンダード' : '無料'}
                <em>{planWhy[detail.planSource]}</em>
              </li>
            </ul>
          </>
          : <div className="mdetail-who"><h2>{error || '読み込んでいます…'}</h2></div>}
      </header>

      {detail && <div className="mdetail-body">
        {/* 1. 続いているか ------------------------------------------------- */}
        <section className="mdetail-block">
          <h3>使われ方</h3>
          <ul className="mdetail-tiles">
            <Tile label="直近30日" value={detail.activity.days30} unit="日" note="開いた日数" />
            <Tile label="続けて" value={detail.activity.streak} unit="日" note="いま連続" />
            <Tile label="のべ" value={detail.activity.totalDays} unit="日" note="記録開始から" />
            <Tile label="最後に開いた日" text={dayLabel(detail.activity.lastSeen) || 'まだ記録なし'}
              note={sinceLabel(detail.activity.lastSeen)} />
          </ul>
          <Calendar recent={detail.activity.recent} />
          {/* **数字の読み方を必ず添える。** 記録を始めたのが最近なので、
              「のべ3日」を「3日しか使っていない」と読まれると判断を誤る。 */}
          <p className="mdetail-note">
            {detail.activity.trackedSince
              ? <>利用日の記録は <b>{dayLabel(detail.activity.trackedSince)}</b> から取り始めました。それ以前の利用は残っていません。</>
              : <>利用日の記録はまだ1件もありません。会員が掲示板を開くと、その日から積み上がります。</>}
          </p>
        </section>

        {/* 2. 場に何を返したか --------------------------------------------- */}
        <section className="mdetail-block">
          <h3>場への関わり</h3>
          <ul className="mdetail-tiles">
            <Tile label="投稿した案件" value={detail.requests.length} unit="件" />
            <Tile label="出したオファー" value={detail.offers.sent} unit="件"
              note={`うち人の紹介 ${detail.offers.referral}件`} />
            <Tile label="届いたオファー" value={detail.offers.received} unit="件" note="自分の案件へ" />
            <Tile label="招待して参加" value={detail.inviteCount} unit="人"
              note={detail.level < 4 ? `あと${nextRankGap(detail.inviteCount)}人で次のランク` : '最上位'} />
          </ul>
          <ul className="mdetail-tiles is-thin">
            <Tile label="メッセージの相手" value={detail.messages.threads} unit="人" />
            <Tile label="送ったメッセージ" value={detail.messages.sent} unit="通" />
            <Tile label="ガチャを引いた" value={detail.gacha.draws} unit="回"
              note={`当たり ${detail.gacha.wonDays}日分`} />
            <Tile label="無料券を使った" value={detail.gacha.usedDays} unit="日分" />
          </ul>
        </section>

        {/* 3. お金 ---------------------------------------------------------- */}
        <section className="mdetail-block">
          <h3>お支払い</h3>
          <ul className="mdetail-tiles">
            <Tile label="広告のお支払い" text={`${detail.ads.paidYen.toLocaleString('ja-JP')}円`}
              note={`${detail.ads.count}件の出稿`} />
            <Tile label="広告の表示" value={detail.ads.views} unit="回"
              note={`クリック ${detail.ads.clicks}回`} />
            <Tile label="プランの出どころ" text={planSourceLabel[detail.planSource]}
              note={detail.planSource === 'contract'
                ? `${detail.planInterval === 'year' ? '年払い' : '月払い'}・${dayLabel(detail.planPeriodEnd) || '期限なし'}まで`
                : detail.planSource === 'bonus' ? `${dayLabel(detail.bonusPeriodEnd)}まで` : ''} />
            <Tile label="Stripeの顧客" text={detail.hasStripeCustomer ? 'あり' : 'なし'}
              note={detail.hasStripeCustomer ? 'カードが登録されています' : 'まだお支払いなし'} />
          </ul>
        </section>

        {/* 投稿した案件 ------------------------------------------------------ */}
        <section className="mdetail-block">
          <h3>投稿した案件 <em>{detail.requests.length}件</em></h3>
          {detail.requests.length
            ? <ul className="mdetail-list">
              {detail.requests.map((item) => <li key={item.id}>
                <div className="mdetail-row-top">
                  <b>{item.title}</b>
                  <span className={`admin-state ${item.status === 'open' ? 'is-on' : 'is-off'}`}>
                    {item.status === 'open' ? '募集中' : '終了'}
                  </span>
                </div>
                <p className="admin-meta">
                  <span>{categoryNames[item.category] ?? item.category}</span>
                  <span>オファー {item.introCount}件</span>
                  <span>期限 {dayLabel(item.deadline)}</span>
                  <span>{dayLabel(item.createdAt.slice(0, 10))} 投稿</span>
                </p>
              </li>)}
            </ul>
            : <p className="mdetail-empty">まだ投稿がありません。</p>}
        </section>

        {/* 広告 -------------------------------------------------------------- */}
        <section className="mdetail-block">
          <h3>広告 <em>{detail.ads.count}件</em></h3>
          {detail.ads.list.length
            ? <ul className="mdetail-list">
              {detail.ads.list.map((ad) => <li key={ad.id}>
                <div className="mdetail-row-top">
                  <b>{ad.title || '(見出しなし)'}</b>
                  <span className={`admin-state ${ad.status === 'active' ? 'is-on' : 'is-off'}`}>{adStatus[ad.status] ?? ad.status}</span>
                </div>
                <p className="admin-meta">
                  <span>{placementName(ad.placement)}</span>
                  <span>{dayLabel(ad.startDate)}〜{dayLabel(ad.endDate)}</span>
                  <span>{ad.amountYen.toLocaleString('ja-JP')}円{ad.giftDays > 0 && `（無料券 ${ad.giftDays}日分）`}</span>
                  <span>表示 {ad.viewCount}／クリック {ad.clickCount}</span>
                </p>
              </li>)}
            </ul>
            : <p className="mdetail-empty">まだ出稿がありません。</p>}
        </section>

        {/* 招待のつながり ----------------------------------------------------- */}
        <section className="mdetail-block">
          <h3>招待のつながり</h3>
          <p className="mdetail-pair">
            <span>この人を招待した人</span>
            <b>{detail.invitedBy
              ? `${detail.invitedBy.displayName}${detail.invitedBy.company ? `（${detail.invitedBy.company}）` : ''}`
              : '直接の登録（招待なし）'}</b>
          </p>
          <p className="mdetail-pair"><span>招待コード</span><b>{detail.inviteCode || '未発行'}</b></p>
          {detail.invitees.length
            ? <ul className="mdetail-list is-compact">
              {detail.invitees.map((item) => <li key={item.id}>
                <div className="mdetail-row-top">
                  <b>{item.displayName || '(名前なし)'}</b>
                  <span className={`admin-state ${item.canUse ? 'is-on' : 'is-off'}`}>{item.canUse ? '利用中' : '停止中'}</span>
                </div>
                <p className="admin-meta">
                  <span>{item.company || '会社名なし'}</span>
                  <span>{dayLabel(item.createdAt.slice(0, 10))} 登録</span>
                </p>
              </li>)}
            </ul>
            : <p className="mdetail-empty">まだ誰も招待していません。</p>}
        </section>

        {/* プロフィール ------------------------------------------------------- */}
        <section className="mdetail-block">
          <h3>プロフィール</h3>
          <dl className="mdetail-facts">
            <Fact label="ふりがな" value={[detail.nameKana, detail.companyKana].filter(Boolean).join('／')} />
            <Fact label="活動エリア" value={detail.businessArea} />
            <Fact label="自分の業種" value={detail.primaryIndustry} />
            <Fact label="おすすめに出したい業種" value={detail.notifyIndustries.join('・')} />
            <Fact label="年商" value={revenueBands[detail.annualRevenueBand] ?? ''} />
            <Fact label="Facebook" value={detail.facebookUrl} link />
            <Fact label="顔写真" value={detail.avatarKey ? '登録あり' : '未登録'} />
            <Fact label="登録日" value={dayLabel(detail.createdAt.slice(0, 10))} />
            <Fact label="利用開始日" value={dayLabel(detail.activatedAt.slice(0, 10))} />
          </dl>
        </section>
      </div>}
    </section>
  </div>;
}

/** 数字ひとつの札。**単位は数字より小さく**、説明はその下に。 */
function Tile({ label, value, unit, text, note }: {
  label: string; value?: number; unit?: string; text?: string; note?: string;
}) {
  return <li className="mdetail-tile">
    <span>{label}</span>
    <b>{text ?? (value ?? 0).toLocaleString('ja-JP')}{unit && <em>{unit}</em>}</b>
    {note && <small>{note}</small>}
  </li>;
}

function Fact({ label, value, link }: { label: string; value: string; link?: boolean }) {
  return <>
    <dt>{label}</dt>
    <dd>{value
      ? link
        ? <a href={value} target="_blank" rel="noreferrer noopener">{value}</a>
        : value
      : <i>未設定</i>}</dd>
  </>;
}

/**
 * 直近8週の出席。**縦が曜日、横が週**（GitHubの草と同じ並べ方）。
 *
 * 折れ線にしないのは、1日に何回開いても1回だからで、上下する量が無いため。
 * 見たいのは「続いているか・空いた週があるか」なので、升目のほうが速く読める。
 */
function Calendar({ recent }: { recent: { date: string; open: boolean }[] }) {
  const weeks: { date: string; open: boolean }[][] = [];
  for (let index = 0; index < recent.length; index += 7) weeks.push(recent.slice(index, index + 7));
  const open = recent.filter((day) => day.open).length;
  return <figure className="mdetail-cal">
    <div className="mdetail-cal-grid" role="img"
      aria-label={`直近56日のうち、${open}日開いています。`}>
      {weeks.map((week) => <span key={week[0].date} className="mdetail-cal-week">
        {week.map((day) => <i key={day.date} className={day.open ? 'is-open' : ''} title={`${dayLabel(day.date)}${day.open ? '：開いた' : '：開いていない'}`} />)}
      </span>)}
    </div>
    <figcaption>
      <span><i className="is-open" aria-hidden="true" />開いた日</span>
      <span><i aria-hidden="true" />開いていない日</span>
      <b>直近8週で {open}日</b>
    </figcaption>
  </figure>;
}

const planWhy: Record<AdminMemberDetail['planSource'], string> = {
  contract: '（ご契約）', bonus: '（招待特典）', campaign: '（キャンペーン）',
  admin: '（管理者特典）', none: '',
};

const planSourceLabel: Record<AdminMemberDetail['planSource'], string> = {
  contract: 'ご契約', bonus: '招待特典', campaign: 'キャンペーン',
  admin: '管理者特典', none: '無料のまま',
};

const categoryNames: Record<string, string> = {
  project: '発注先', collaboration: '協業先', consultation: '相談',
};

const adStatus: Record<string, string> = {
  active: '掲載中', reserved: 'お支払い待ち', stopped: '停止', finished: '終了',
};

/** ランクが上がるまであと何人か。しきい値は app/rank-perks.ts と同じ。 */
function nextRankGap(inviteCount: number) {
  const thresholds = [10, 30, 50];
  const next = thresholds.find((threshold) => inviteCount < threshold);
  return next ? next - inviteCount : 0;
}

function dayLabel(value: string) {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).replace(/-/g, '/') : '';
}

/** 最後に開いた日から何日経ったか。日付だけだと「古いのか」が伝わらない。 */
function sinceLabel(lastSeen: string) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(lastSeen)) return '';
  const today = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
  const gap = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${lastSeen.slice(0, 10)}T00:00:00Z`)) / 86400_000);
  if (gap <= 0) return '今日';
  if (gap === 1) return '昨日';
  return `${gap}日前`;
}
