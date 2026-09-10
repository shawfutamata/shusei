'use client';

import { useState } from 'react';
import styles from './LandingPage.module.css';

export default function LandingInvite() {
  const [code, setCode] = useState('');
  return <form className={styles.inviteForm} onSubmit={(event) => {
    event.preventDefault();
    if (/^[A-Z0-9]{8}$/.test(code)) window.location.assign(`/join/${code}`);
  }}>
    <label htmlFor="lp-invite">招待コード（8桁の英数字）</label>
    <div><input id="lp-invite" name="code" value={code} onChange={(event) => setCode(event.target.value.replace(/[^a-z0-9]/gi, '').toUpperCase().slice(0, 8))} placeholder="A1B2C3D4" autoComplete="off" autoCapitalize="characters" spellCheck={false} minLength={8} maxLength={8} pattern="[A-Z0-9]{8}" required aria-describedby="lp-invite-help" />
    <button type="submit" className={styles.primary}>招待を確かめる <span aria-hidden="true">↗</span></button></div>
    <p id="lp-invite-help">コードをお持ちでない方は、TASUKIをご利用中の会員に招待リンクをお尋ねください。</p>
  </form>;
}
