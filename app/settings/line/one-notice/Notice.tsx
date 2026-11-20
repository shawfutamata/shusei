'use client';
import { useState } from 'react';
type Status = { status: string; closed: boolean; ready: boolean; window: string };
export default function Notice({ email, text, initial }: { email: string; text: string; initial: Status }) {
  const [status, setStatus] = useState(initial), [busy, setBusy] = useState(false), [confirmed, setConfirmed] = useState(false), [message, setMessage] = useState('');
  async function act(action: 'send' | 'close') {
    setBusy(true); setMessage('');
    // 結果不明でボタンを再有効化しない。状態確認はページを読み直して行う。
    try {
      const response = await fetch('/api/admin/line-one-notice', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, confirm: true, window: status.window }) });
      const result = await response.json() as Status;
      if (!response.ok) throw new Error();
      setStatus(result); setMessage(action === 'close' ? '試験を閉じました。送信中の要求は取り消せません。' : '送信操作を終了しました。受付成功は実着信の保証ではありません。');
    } catch { setStatus(s => ({ ...s, ready: false })); setMessage('結果を確認できません。同じ操作を繰り返さず運営で確認してください。'); }
    finally { setBusy(false); }
  }
  return <main style={{ maxWidth: 640, margin: '40px auto', padding: 24, lineHeight: 1.8 }}>
    <h1>本人限定1通テスト</h1><p>対象会員：{email}</p><p>一般公開・通常通知はOFFのままです。他の会員には送りません。最大1通、再送はしません。</p>
    <p>送信文：{text}</p><p>有効期間（UTC）：{status.window.replace('|', ' 〜 ')}</p>
    <p>状態：{status.closed ? '閉鎖済み' : status.status === 'unused' ? '未送信' : status.status === 'accepted' ? 'LINE受付成功（着信は本人確認が必要）' : status.status === 'failed' ? '失敗・枠消費済み' : '結果不明・枠消費済み'}</p>
    <label><input type="checkbox" checked={confirmed} disabled={busy || !status.ready} onChange={e => setConfirmed(e.target.checked)} />本人のLINEへ上記のテスト通知を1通送信することを確認しました。</label>
    <p><button disabled={busy || !confirmed || !status.ready} onClick={() => act('send')}>本人のLINEへ1通だけ送る</button></p>
    <button disabled={busy || status.closed} onClick={() => act('close')}>送信枠を閉じる（元に戻せません）</button>
    <p role="status">{message}</p><p>失敗・結果不明でも送信枠は戻りません。期限後は送信できません。試験終了はLINE連携解除ではありません。</p><a href="/settings/line">LINE設定に戻る</a>
  </main>;
}
