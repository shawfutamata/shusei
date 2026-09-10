'use client';

import { useEffect, useState } from 'react';
import { serviceName } from './brand';

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

export default function InstallAndNotificationPanel({ onNotice }: { onNotice: (message: string) => void }) {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [pushState, setPushState] = useState<'loading' | 'unsupported' | 'off' | 'on' | 'denied'>('loading');
  /**
   * メッセージが届いたときのメール。**既定は送る。**
   * null のあいだは、まだサーバーに聞けていない（ボタンは押せない）。
   */
  const [mailOn, setMailOn] = useState<boolean | null>(null);

  useEffect(() => {
    let alive = true;
    fetch('/api/profile/mail').then((response) => response.ok ? response.json() : null)
      .then((data) => { if (alive && data) setMailOn(Boolean((data as { on: boolean }).on)); })
      .catch(() => { /* 読めなくても画面は動かす。押したときに直る。 */ });
    return () => { alive = false; };
  }, []);

  /** メールのお知らせを切り替える。**押した瞬間に見た目を変えて**、通信は後ろで。 */
  async function toggleMail() {
    const next = !mailOn;
    setMailOn(next);
    try {
      const response = await fetch('/api/profile/mail', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ on: next }),
      });
      if (!response.ok) throw new Error();
      onNotice(next ? 'メッセージが届いたら、ご登録のメールにお知らせします。' : 'メールでのお知らせを止めました。');
    } catch {
      // 戻せなかったら、押す前の状態に返す。オンのままだと思わせない。
      setMailOn(!next);
      onNotice('設定を変えられませんでした。時間をおいてお試しください。');
    }
  }

  useEffect(() => {
    const handleInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', handleInstall);
    queueMicrotask(() => {
      const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
      setInstalled(standalone);
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
        setPushState('unsupported');
        return;
      }
      navigator.serviceWorker.register('/sw.js').then(async () => {
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.getSubscription();
        if (Notification.permission === 'denied') setPushState('denied');
        else setPushState(subscription ? 'on' : 'off');
      }).catch(() => setPushState('unsupported'));
    });

    return () => window.removeEventListener('beforeinstallprompt', handleInstall);
  }, []);

  async function enableNotifications() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return onNotice('このブラウザーはプッシュ通知に対応していません。');
    }
    if (Notification.permission === 'denied') {
      setPushState('denied');
      return onNotice(`ブラウザーの設定から${serviceName}の通知を許可してください。`);
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setPushState(permission === 'denied' ? 'denied' : 'off');
        return onNotice('通知はまだ有効になっていません。');
      }
      const keyResponse = await fetch('/api/push');
      const keyData = await keyResponse.json() as { publicKey?: string; available?: boolean; error?: string };
      if (!keyResponse.ok || !keyData.available || !keyData.publicKey) throw new Error(keyData.error ?? '通知を準備できませんでした。');
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(keyData.publicKey),
      });
      const response = await fetch('/api/push', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(subscription.toJSON()),
      });
      if (!response.ok) throw new Error('通知端末を登録できませんでした。');
      setPushState('on');
      onNotice('関連する案件のプッシュ通知を有効にしました。');
    } catch (error) {
      setPushState('off');
      onNotice(error instanceof Error ? error.message : '通知を有効にできませんでした。');
    }
  }

  async function installApp() {
    if (installed) return onNotice(`${serviceName}はホーム画面から使えます。`);
    if (!installPrompt) return onNotice('iPhoneは共有ボタンから「ホーム画面に追加」を選んでください。');
    await installPrompt.prompt();
    const result = await installPrompt.userChoice;
    if (result.outcome === 'accepted') {
      setInstalled(true);
      setInstallPrompt(null);
      onNotice(`${serviceName}をホーム画面に追加しました。`);
    }
  }

  return <section className="app-tools" aria-label="アプリと通知の設定">
    <div><p>APP &amp; NOTIFICATIONS</p><h2>アプリと通知</h2></div>
    <p className="app-tools-lead">ホーム画面からすぐ開けます。新着案件のプッシュ通知と、メッセージ内容を確認できるメール通知を設定できます。</p>
    <div className="app-tools-actions">
      <button className={pushState === 'on' ? 'enabled' : ''} onClick={enableNotifications} disabled={pushState === 'loading' || pushState === 'unsupported'}><span>●</span><b>{pushState === 'on' ? '通知オン' : pushState === 'denied' ? '通知を再設定' : '通知を受け取る'}</b><small>{pushState === 'on' ? '関連業種の新着をお知らせ' : '業種タグが一致した投稿だけ'}</small></button>
      <button className={installed ? 'enabled' : ''} onClick={installApp}><span>＋</span><b>{installed ? '追加済み' : 'ホーム画面に追加'}</b><small>ブラウザーを開かず起動</small></button>
      {/* メールのお知らせ。**通知を許可していない人にも届く道**なので、
          プッシュとは別に置いてある。 */}
      <button className={mailOn ? 'enabled' : ''} onClick={toggleMail} disabled={mailOn === null}>
        <span>✉</span>
        <b>{mailOn === null ? '読み込み中' : mailOn ? 'メッセージ通知オン' : 'メールで受け取る'}</b>
        <small>{mailOn ? '内容をメールでも確認できます' : 'ご登録のメールアドレスへ通知'}</small>
      </button>
    </div>
    <small className="app-tools-note">通知はいつでもこの画面から変更できます。iPhoneのプッシュ通知は、ホーム画面へ追加した後に有効にしてください。</small>
  </section>;
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
