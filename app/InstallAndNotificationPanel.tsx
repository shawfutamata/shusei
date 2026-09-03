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
    <div><p>APP MODE</p><h2>アプリのように使う</h2></div>
    <p className="app-tools-lead">ホーム画面からすぐ開けて、関連する案件の通知を受け取れます。</p>
    <div className="app-tools-actions">
      <button className={pushState === 'on' ? 'enabled' : ''} onClick={enableNotifications} disabled={pushState === 'loading' || pushState === 'unsupported'}><span>●</span><b>{pushState === 'on' ? '通知オン' : pushState === 'denied' ? '通知を再設定' : '通知を受け取る'}</b><small>{pushState === 'on' ? '関連業種の新着をお知らせ' : '業種タグが一致した投稿だけ'}</small></button>
      <button className={installed ? 'enabled' : ''} onClick={installApp}><span>＋</span><b>{installed ? '追加済み' : 'ホーム画面に追加'}</b><small>ブラウザーを開かず起動</small></button>
    </div>
    <small className="app-tools-note">iPhoneはホーム画面へ追加した後に通知を有効にしてください。</small>
  </section>;
}

function urlBase64ToUint8Array(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}
