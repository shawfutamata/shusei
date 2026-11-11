'use client';

import { useEffect, useRef, useState } from 'react';
import { serviceName, serviceUrl } from './brand';
import './home-screen-install.css';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };
export function isHomeScreenApp() {
  return window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
export function canOfferHomeScreenGuide() {
  return !isHomeScreenApp() && (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
}

// ブラウザが許可した時だけ実際の追加ボタンを出す。iOSには共通の追加APIがない。
export default function HomeScreenInstallGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    const capture = (event: Event) => { if (canOfferHomeScreenGuide()) { event.preventDefault(); setPrompt(event as InstallEvent); } };
    const installed = () => { setPrompt(null); setMessage('追加されました。ホーム画面のアイコンから開けます。'); };
    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', installed);
    return () => { window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', installed); };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, [open]);
  if (!open) return null;
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const embedded = /Line\/|FBAN|FBAV|Instagram|; wv\)/i.test(ua);
  const safari = ios && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) && !embedded;
  async function install() {
    if (!prompt || busy) return;
    const current = prompt;
    setPrompt(null); setBusy(true);
    try {
      await current.prompt();
      const result = await current.userChoice;
      setMessage(result.outcome === 'accepted' ? '追加を受け付けました。端末の画面で完了をご確認ください。' : '追加しなくても、そのまま利用できます。');
    } catch { setMessage('ブラウザのメニューから、下の手順で追加してください。'); }
    finally { setBusy(false); }
  }
  return <div className="home-install-layer" onKeyDown={(event) => {
    if (event.key === 'Escape') onClose();
    if (event.key === 'Tab') {
      const nodes = panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), a[href]');
      if (!nodes?.length) return;
      const first = nodes[0], last = nodes[nodes.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  }}>
    <section className="home-install-card" ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="home-install-title">
      <div className="home-install-heading"><span>次回は、ここからすぐに</span><button type="button" onClick={onClose}>あとで</button></div>
      <h2 id="home-install-title">ホーム画面に追加しませんか？</h2>
      <div className="home-install-preview">
        {/* 実際に配信するアイコンを見せる。端末の画面そのものとは区別する。 */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={ios ? '/apple-touch-icon.png' : '/icon-192.png'} width="64" height="64" alt="" />
        <strong>{serviceName}</strong><small>追加後のアイコンのイメージ</small>
      </div>
      <p>スマホのホーム画面から、タップひとつで開けます。追加は任意です。</p>
      {(embedded || (ios && !safari)) && <p className="home-install-note">この画面で追加メニューが見つからないときは、{ios ? 'Safari' : 'Chrome'}で {serviceUrl} を開いてください。</p>}
      <h3>{ios ? 'iPhone・iPad（Safari）の手順' : 'Android（Chrome）の手順'}</h3>
      {ios ? <ol>
        <li>Safariの「共有」（四角から上向きの矢印）をタップ。見つからない場合は「…」メニューを開きます。</li>
        <li>一覧をスクロールして「ホーム画面に追加」を選択。</li>
        <li>「ウェブアプリとして開く」がある場合はオンにし、名前を確認して「追加」をタップ。</li>
      </ol> : <ol>
        <li>Chromeのメニュー「︙」をタップ。</li>
        <li>「ホーム画面に追加」または「インストールしてショートカットを作成」を選択。</li>
        <li>「インストール」または「追加」をタップし、端末の案内に従います。</li>
      </ol>}
      {ios && <p className="home-install-note">「ホーム画面に追加」がない場合は、共有一覧の一番下の「アクションを編集」から追加できます。</p>}
      <p className="home-install-note">メニュー名やアイコンの形はOS・ブラウザで異なります。追加済みなら「あとで」で閉じられます。利用にはインターネット接続が必要です。</p>
      {message && <p role="status" className="home-install-note">{message}</p>}
      {!ios && prompt && <button className="home-install-primary" type="button" disabled={busy} onClick={install}>ホーム画面に追加する</button>}
      <button className="home-install-close" type="button" onClick={onClose}>今は追加せずに進む</button>
    </section>
  </div>;
}
