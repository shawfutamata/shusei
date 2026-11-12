'use client';
import { useRef, useState } from 'react';
import Link from 'next/link';
import { serviceName } from '@/app/brand';
import { LINE_LINK_DISCLOSURE } from '@/app/line-data-consent';
import styles from './line-test.module.css';

type Status = { closed: boolean; linkedReady: boolean; slots: { slot: 1 | 2; status: 'unused' | 'accepted' | 'unknown' | 'failed' }[] };
function validStatus(value: unknown): value is Status {
  if (!value || typeof value !== 'object') return false;
  const state = value as Partial<Status>;
  return typeof state.closed === 'boolean' && typeof state.linkedReady === 'boolean' && Array.isArray(state.slots)
    && state.slots.length === 2 && state.slots.every((item, index) => item && item.slot === index + 1 && ['unused', 'accepted', 'unknown', 'failed'].includes(item.status));
}
const descriptions = { unused: '未使用', accepted: 'LINE受付済み（端末への到着は別に確認）', unknown: '結果未確認・使用済み（再送しません）', failed: '失敗・使用済み（再送しません）' };
export default function LineTest({ email, initialStatus, friendUrl, initialMessage }: { email: string; initialStatus: Status; friendUrl: string; initialMessage: string }) {
  const [status, setStatus] = useState(initialStatus);
  const [consent, setConsent] = useState(false), [sendConsent, setSendConsent] = useState(false);
  const [busy, setBusy] = useState(false), [uncertain, setUncertain] = useState(false), [message, setMessage] = useState(initialMessage);
  const active = useRef(false), notice = useRef<HTMLParagraphElement>(null);
  async function act(action: 'send' | 'close', slot?: 1 | 2) {
    if (active.current || uncertain) return;
    active.current = true; setBusy(true); setMessage('処理中です。画面を閉じずにお待ちください。');
    try {
      const response = await fetch('/api/admin/line-test', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(slot ? { slot } : {}), confirm: true }) });
      const result = await response.json();
      if (!response.ok || !validStatus(result)) throw new Error('result_uncertain');
      setStatus(result); setMessage(action === 'close' ? 'テストを終了しました。既に送信中の要求や送信済み通知は取り消せません。' : '結果を下の使用状況と本人のLINEで確認してください。LINE受付済みでも端末への配達は保証されません。');
    } catch { setUncertain(true); setMessage('結果を確認できません。同じ操作は繰り返さず、ページを再読み込みして使用状況を確認してください。結果不明でも送信枠は戻りません。'); }
    finally { active.current = false; setBusy(false); requestAnimationFrame(() => notice.current?.focus()); }
  }
  return <main className={styles.page}>
    <h1>LINE本人限定テスト</h1>
    <p>対象の{serviceName}会員: <strong className={styles.email}>{email}</strong></p>
    <p>運営本人だけが使う一度きりの接続確認です。他の会員へは送りません。一般向けLINEログイン・登録・自動通知はOFFのままです。</p>
    <p ref={notice} tabIndex={-1} role="status" className={styles.notice}>{message || 'LINEへ送る前に、本人のアカウントであることを確認してください。'}</p>
    {!status.closed && !status.linkedReady && <section>
      <h2>1. 本人のLINEと連携</h2>
      <form action="/api/auth/line/start" method="post">
        <input type="hidden" name="action" value="test_link" />
        <label className={styles.check}><input type="checkbox" name="consent" value="yes" required checked={consent} onChange={event => setConsent(event.target.checked)} /><span>{LINE_LINK_DISCLOSURE} 今回は本人限定テストに使います。</span></label>
        <button className={styles.lineButton} type="submit" disabled={!consent || busy || uncertain}>本人のLINEで連携する</button>
      </form>
    </section>}
    <section>
      <h2>2. 最大2通のテスト通知</h2>
      <p>本人のLINEで公式アカウントを友だち追加してください。名前やメッセージ本文は送りません。</p>
      {friendUrl && <a href={friendUrl} target="_blank" rel="noreferrer">{serviceName}公式LINEを開く</a>}
      <label className={styles.check}><input type="checkbox" checked={sendConsent} onChange={event => setSendConsent(event.target.checked)} disabled={status.closed || busy || uncertain} /><span>上記{serviceName}会員と連携した本人のLINEへ、固定の接続テスト通知を送ることを確認しました。</span></label>
      <p>通信失敗・未配達・結果不明でも使用済みになります。自動再送はせず、テスト終了・連携解除・再読み込みで枠は増えません。枠の使用状況は終了後も残りますが、宛先・本文・認証トークンはこの台帳に保存しません。</p>
      <ul className={styles.slots}>{status.slots.map(item => <li key={item.slot}>
        <span>テスト {item.slot}: {descriptions[item.status]}</span>
        <button className={styles.lineButton} type="button" disabled={!sendConsent || !status.linkedReady || status.closed || item.status !== 'unused' || busy || uncertain} onClick={() => void act('send', item.slot)}>本人へテスト {item.slot} を送る</button>
      </li>)}</ul>
    </section>
    <section>
      <h2>3. 終了・連携解除</h2>
      <button className={styles.stopButton} type="button" disabled={status.closed || busy || uncertain} onClick={() => void act('close')}>残りの枠を閉じてテストを終了</button>
      {status.closed && <p>テストは終了しています。未使用の枠も再開できません。</p>}
      <p>テスト終了だけではLINE連携情報は削除されません。既にLINE本人確認の処理が進んでいる場合も、その結果は取り消せません。<Link href="/settings/line">LINE連携設定</Link>からメール本人確認を行って解除できます。確認メールは今回の承認範囲の1通だけとし、届かない場合も再送せず確認します。</p>
    </section>
    <Link href="/">{serviceName}へ戻る</Link>
  </main>;
}
