'use client';
import { useEffect, useState } from 'react';
import styles from './LineConnectionCard.module.css';

type Connection = { linked: boolean; enabled: boolean; canEnable: boolean; notificationsReady: boolean; notifyMessage: boolean; notifyOffer: boolean };
type View = { kind: 'loading' } | { kind: 'error' } | { kind: 'ready'; connection: Connection };
function readConnection(value: unknown): Connection {
  if (!value || typeof value !== 'object') throw new Error('Invalid connection status');
  const data = value as Record<string, unknown>;
  for (const key of ['linked', 'enabled', 'canEnable', 'notificationsReady', 'notifyMessage', 'notifyOffer']) {
    if (typeof data[key] !== 'boolean') throw new Error('Invalid connection status');
  }
  return { linked: data.linked as boolean, enabled: data.enabled as boolean, canEnable: data.canEnable as boolean, notificationsReady: data.notificationsReady as boolean, notifyMessage: data.notifyMessage as boolean, notifyOffer: data.notifyOffer as boolean };
}

export default function LineConnectionCard() {
  const [view, setView] = useState<View>({ kind: 'loading' });
  useEffect(() => {
    let generation = 0, controller: AbortController | null = null, timer: ReturnType<typeof setTimeout> | undefined;
    const invalidate = () => { generation++; controller?.abort(); clearTimeout(timer); };
    const load = (refresh = false) => {
      invalidate();
      const current = generation, request = new AbortController(); controller = request;
      if (refresh) setView({ kind: 'loading' });
      // 状態を読めないときに「未連携」と決めつけず、設定画面への入口は残す。
      timer = setTimeout(() => { if (current === generation) { generation++; request.abort(); setView({ kind: 'error' }); } }, 15000);
      void fetch('/api/line/settings', { method: 'GET', credentials: 'same-origin', cache: 'no-store', signal: request.signal })
        .then(async response => { if (!response.ok) throw new Error('Connection unavailable'); return readConnection(await response.json()); })
        .then(connection => { if (current === generation && !request.signal.aborted) setView({ kind: 'ready', connection }); })
        .catch(() => { if (current === generation && !request.signal.aborted) setView({ kind: 'error' }); })
        .finally(() => { if (current === generation) clearTimeout(timer); });
    };
    // 戻る操作で連携前の表示が復元されても、古い応答を使わず読み直す。
    const restore = (event: PageTransitionEvent) => { if (event.persisted) load(true); };
    window.addEventListener('pagehide', invalidate); window.addEventListener('pageshow', restore);
    load();
    return () => { invalidate(); window.removeEventListener('pagehide', invalidate); window.removeEventListener('pageshow', restore); };
  }, []);

  const status = view.kind === 'ready' ? view.connection : null;
  const badge = view.kind === 'loading' ? '確認中' : view.kind === 'error' ? '状態を確認できません' : status?.linked ? '連携済み' : '未連携';
  const description = view.kind === 'loading' ? 'LINEとの連携状況を確認しています。'
    : view.kind === 'error' ? '通信状況をご確認のうえ、設定画面で連携状況をご確認ください。'
    : status?.linked ? (status.enabled ? 'LINEと連携済みです。ログイン・通知の設定や連携解除はこちらから。' : 'LINEは連携済みです。一般向けのLINEログインは準備中です。')
    : !status?.enabled ? '現在、新しいLINE連携は準備中です。設定画面でご案内をご確認いただけます。'
    : !status.canEnable ? '現在の会員状態では新しい連携を行えません。設定画面でご確認ください。'
    : '今の会員情報をそのままに、LINEと連携できます。次の画面で説明を確認してから連携します。';
  const notification = !status?.linked ? '' : !status.notificationsReady ? 'LINE通知は準備中です。'
    : status.notifyMessage || status.notifyOffer ? 'LINE通知：設定あり。友だち未追加・ブロック中などは届かない場合があります。' : 'LINE通知：オフ。詳細は設定画面でご確認ください。';
  const label = status?.linked ? '通知設定・連携解除' : status?.enabled && status.canEnable ? 'LINEを連携する' : view.kind === 'error' ? '設定画面で確認する' : 'LINE連携の設定を見る';
  return <section className={styles.card} aria-labelledby="mypage-line-title">
    <div className={styles.heading}><h2 id="mypage-line-title">LINE連携</h2><span className={status?.linked ? styles.linked : styles.badge} role="status">{badge}</span></div>
    <p className={styles.description}>{description}</p>
    {notification && <p className={styles.notification}>{notification}</p>}
    <a className={styles.action} href="/settings/line">{label}<span aria-hidden="true">›</span></a>
    <p className={styles.note}>このボタンだけで連携や通知が始まることはありません。</p>
  </section>;
}
