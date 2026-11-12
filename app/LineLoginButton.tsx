'use client';
import { useEffect, useState } from 'react';
import './line.css';
export function useLineAvailability() {
  const [config, setConfig] = useState({ login: false, signup: false });
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/auth/line/config', { cache: 'no-store', signal: controller.signal })
      .then(async r => r.ok ? await r.json() as { login?: boolean; signup?: boolean } : null).then(data => { if (data) setConfig({ login: data.login === true, signup: data.signup === true }); }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  return config;
}
export default function LineLoginButton({ returnTo = '/' }: { returnTo?: string }) {
  const config = useLineAvailability();
  return config.login ? <div className="line-login-option"><a className="line-button" href={`/api/auth/line/start?return_to=${encodeURIComponent(returnTo)}`}>LINEでログイン</a><small>連携済みのLINEでログインできます。</small></div> : null;
}
