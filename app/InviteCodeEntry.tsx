'use client';

import { useState } from 'react';

/**
 * 招待コードを手で入れる入口。
 *
 * 招待リンクを押してもらうのがいちばん早いが、例会で口頭で伝えたり、
 * 名刺に書いて渡したりする場面がある。**リンクを開けない相手にも
 * 同じ道が要る**ので、コードを打つ入口を残しておく。
 *
 * 判定はしない。押されたら招待ページ（/join/コード）へ送るだけで、
 * 使えるコードかどうかはそのページが確かめる。
 */
export default function InviteCodeEntry() {
  const [code, setCode] = useState('');
  const [open, setOpen] = useState(false);
  const clean = code.trim().toUpperCase();

  if (!open) {
    return <button type="button" className="invite-code-toggle" onClick={() => setOpen(true)}>
      招待コードをお持ちの方はこちら
    </button>;
  }

  return <form className="invite-code-entry" onSubmit={(event) => {
    event.preventDefault();
    if (clean) window.location.href = `/join/${encodeURIComponent(clean)}`;
  }}>
    <label>
      <span>招待コード</span>
      {/* 英数字だけ。手で打つものなので、小文字で入れても大文字に直す。 */}
      <input value={code} maxLength={16} autoCapitalize="characters" autoComplete="off" spellCheck={false}
        placeholder="例：A1B2C3D4" onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9]/g, ''))} />
    </label>
    <button className="primary-button" disabled={!clean}>招待を確かめる</button>
  </form>;
}
