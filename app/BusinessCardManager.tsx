'use client';
/* eslint-disable @next/next/no-img-element -- private R2 and local preview URLs are not compatible with image optimization */

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import type { BusinessCard, BusinessCardInput } from '@/db/data';
import { emptyBusinessCard, scanBusinessCardImage, type OCRStage } from './business-card-ocr';

type Mode = 'list' | 'capture' | 'scan' | 'review' | 'confirm' | 'complete' | 'detail';
type QueueItem = { id: string; file: File; preview: string };
type DraftCard = BusinessCardInput & { queueId: string };

export default function BusinessCardManager({ initialMode, onClose, onNotice }: {
  initialMode: 'list' | 'capture';
  onClose: () => void;
  onNotice: (message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [cards, setCards] = useState<BusinessCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [drafts, setDrafts] = useState<DraftCard[]>([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [selected, setSelected] = useState<BusinessCard | null>(null);
  const [editing, setEditing] = useState(false);
  const [search, setSearch] = useState('');
  const [favoriteOnly, setFavoriteOnly] = useState(false);
  const [progress, setProgress] = useState({ card: 0, percent: 0 });
  const [savedCount, setSavedCount] = useState(0);
  const queueRef = useRef<QueueItem[]>([]);

  useEffect(() => { void loadCards(); }, []);
  useEffect(() => { queueRef.current = queue; }, [queue]);
  useEffect(() => () => queueRef.current.forEach((item) => URL.revokeObjectURL(item.preview)), []);

  const shownCards = useMemo(() => cards.filter((card) => {
    const haystack = `${card.name} ${card.company} ${card.positionTitle} ${card.department} ${card.groupName} ${card.memo}`.toLowerCase();
    return (!favoriteOnly || card.isFavorite) && (!search.trim() || haystack.includes(search.trim().toLowerCase()));
  }), [cards, favoriteOnly, search]);
  const groupedCards = useMemo(() => Object.entries(shownCards.reduce<Record<string, BusinessCard[]>>((groups, card) => {
    (groups[card.exchangeDate] ??= []).push(card); return groups;
  }, {})), [shownCards]);

  async function loadCards() {
    setLoading(true);
    const response = await fetch('/api/business-cards');
    if (response.ok) {
      const data = await response.json() as { cards: BusinessCard[] };
      setCards(data.cards);
    }
    setLoading(false);
  }

  function addFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (!files.length) return;
    const available = Math.max(0, 20 - queue.length);
    const valid = files.filter((file) => ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) && file.size <= 10 * 1024 * 1024).slice(0, available);
    if (valid.length !== files.length) onNotice('JPEG・PNG・WebP、1枚10MB以下、合計20枚まで選べます。');
    setQueue((current) => [...current, ...valid.map((file) => ({ id: crypto.randomUUID(), file, preview: URL.createObjectURL(file) }))]);
  }

  function removeQueue(id: string) {
    setQueue((current) => {
      const target = current.find((item) => item.id === id);
      if (target) URL.revokeObjectURL(target.preview);
      return current.filter((item) => item.id !== id);
    });
  }

  async function scanCards() {
    if (!queue.length) return onNotice('名刺を1枚以上撮影・選択してください。');
    setMode('scan'); setProgress({ card: 1, percent: 0 });
    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null;
    let orientationWorker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null;
    let activeStage: OCRStage = 'orientation';
    try {
      const { createWorker, OEM } = await import('tesseract.js');
      const reportProgress = (message: { status: string; progress: number }) => {
        if (message.status !== 'recognizing text' || typeof message.progress !== 'number') return;
        const stageNumber = activeStage === 'primary' ? 0 : activeStage === 'contrast' ? 1 : activeStage === 'name' ? 2 : 0;
        setProgress((current) => ({ ...current, percent: Math.max(current.percent, Math.min(99, Math.round(((stageNumber + message.progress) / 3) * 100))) }));
      };
      orientationWorker = await createWorker('osd', OEM.TESSERACT_ONLY);
      worker = await createWorker(['jpn', 'eng'], OEM.LSTM_ONLY, {
        logger: (message) => {
          reportProgress(message);
        },
      });
      const nextDrafts: DraftCard[] = [];
      for (let index = 0; index < queue.length; index += 1) {
        setProgress({ card: index + 1, percent: 0 });
        const result = await scanBusinessCardImage(queue[index].file, worker, orientationWorker, (stage) => { activeStage = stage; });
        setProgress({ card: index + 1, percent: 100 });
        nextDrafts.push({ queueId: queue[index].id, ...result });
      }
      setDrafts(nextDrafts); setReviewIndex(0); setMode('review');
      onNotice(`${nextDrafts.length}枚を読み取りました。内容を確認・修正してください。`);
    } catch {
      setDrafts(queue.map((item) => ({ queueId: item.id, ...emptyBusinessCard() })));
      setReviewIndex(0); setMode('review');
      onNotice('読み取りに失敗した項目は、手入力で保存できます。');
    } finally {
      if (worker) await worker.terminate();
      if (orientationWorker) await orientationWorker.terminate();
    }
  }

  function updateDraft(field: keyof BusinessCardInput, value: string | boolean) {
    setDrafts((current) => current.map((draft, index) => index === reviewIndex ? { ...draft, [field]: value } : draft));
  }

  async function saveDrafts() {
    if (drafts.some((draft) => !draft.exchangeDate)) return onNotice('すべての名刺に交換日を入力してください。');
    setBusy(true);
    const body = new FormData();
    body.set('cards', JSON.stringify(drafts.map((draft) => {
      const fields: Partial<DraftCard> = { ...draft };
      delete fields.queueId;
      return fields;
    })));
    drafts.forEach((draft, index) => {
      const source = queue.find((item) => item.id === draft.queueId);
      if (source) body.set(`image_${index}`, source.file);
    });
    const response = await fetch('/api/business-cards', { method: 'POST', body });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return onNotice(result.error ?? '名刺を保存できませんでした。');
    const count = drafts.length;
    queue.forEach((item) => URL.revokeObjectURL(item.preview));
    setQueue([]); setDrafts([]); setSavedCount(count); setMode('complete'); await loadCards();
  }

  function openDetail(card: BusinessCard) {
    setSelected(card); setEditing(false); setMode('detail');
  }

  async function saveSelected(next: BusinessCard) {
    setBusy(true);
    const response = await fetch('/api/business-cards', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return onNotice(result.error ?? '名刺を更新できませんでした。');
    setCards((current) => current.map((card) => card.id === next.id ? next : card));
    setSelected(next); setEditing(false); onNotice('名刺情報を保存しました。');
  }

  async function toggleFavorite(card: BusinessCard) {
    const next = { ...card, isFavorite: !card.isFavorite };
    setCards((current) => current.map((item) => item.id === card.id ? next : item));
    if (selected?.id === card.id) setSelected(next);
    const response = await fetch('/api/business-cards', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
    if (!response.ok) { await loadCards(); return onNotice('お気に入りを更新できませんでした。'); }
    onNotice(next.isFavorite ? '重要な名刺に追加しました。' : '重要な名刺から外しました。');
  }

  async function deleteSelected() {
    if (!selected || !window.confirm(`${selected.name || 'この名刺'}を削除しますか？`)) return;
    setBusy(true);
    const response = await fetch('/api/business-cards', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: selected.id }) });
    setBusy(false);
    if (!response.ok) return onNotice('名刺を削除できませんでした。');
    setCards((current) => current.filter((card) => card.id !== selected.id)); setSelected(null); setMode('list');
    onNotice('名刺を削除しました。');
  }

  function closeOrBack() {
    if (mode === 'list') return onClose();
    if (mode === 'detail') { setMode('list'); setSelected(null); return; }
    if (mode === 'confirm') { setReviewIndex(Math.max(0, drafts.length - 1)); setMode('review'); return; }
    if (mode === 'complete') { setMode('list'); return; }
    if (mode === 'review') { setMode('capture'); return; }
    if (mode !== 'scan') setMode('list');
  }

  return <div className="cardbook-backdrop"><section className="cardbook" role="dialog" aria-modal="true" aria-label="個人名刺帳">
    <header className="cardbook-header"><button onClick={closeOrBack} disabled={mode === 'scan'} aria-label="戻る">‹</button><div><b>{mode === 'detail' ? '名刺詳細' : mode === 'capture' ? '名刺を追加' : mode === 'scan' ? '文字を読み取り中' : mode === 'review' ? '読み取り結果を確認' : mode === 'confirm' ? '登録内容を確認' : mode === 'complete' ? '登録完了' : '個人名刺帳'}</b><small>{mode === 'list' ? `${cards.length}枚を本人だけに保存` : mode === 'confirm' ? '登録前に内容を見直せます' : mode === 'complete' ? '名刺帳へ保存しました' : '複数枚をまとめて登録できます'}</small></div>{mode === 'list' ? <button className="cardbook-add" onClick={() => setMode('capture')}>＋追加</button> : <span />}</header>

    {mode === 'list' && <div className="cardbook-body cardbook-list-view">
      <div className="cardbook-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="名前・会社・グループで検索" /></div>
      <div className="cardbook-tabs"><button className={!favoriteOnly ? 'active' : ''} onClick={() => setFavoriteOnly(false)}>すべて <span>{cards.length}</span></button><button className={favoriteOnly ? 'active' : ''} onClick={() => setFavoriteOnly(true)}>★ 重要 <span>{cards.filter((card) => card.isFavorite).length}</span></button></div>
      {loading ? <div className="cardbook-empty">名刺帳を読み込んでいます…</div> : groupedCards.length === 0 ? <div className="cardbook-empty"><b>{cards.length ? '該当する名刺がありません' : '名刺帳はまだ空です'}</b><span>カメラで何枚でも続けて撮影できます。</span><button onClick={() => setMode('capture')}>最初の名刺を追加する</button></div> : groupedCards.map(([date, group]) => <section className="card-date-group" key={date}><h2>{formatDate(date)} <span>{group.length}枚</span></h2>{group.map((card) => <article className="cardbook-row" key={card.id}><button className={card.isFavorite ? 'card-star active' : 'card-star'} onClick={() => toggleFavorite(card)} aria-label="重要な名刺にする">★</button><button className="cardbook-open" onClick={() => openDetail(card)}><div><b>{card.name || '氏名未登録'}</b><span>{card.company || '会社名未登録'}</span><small>{[card.positionTitle, card.department].filter(Boolean).join('・') || '肩書き未登録'}</small></div><img src={card.imageUrl} alt={`${card.name || '登録済み'}の名刺`} /><i>›</i></button></article>)}</section>) }
    </div>}

    {mode === 'capture' && <div className="cardbook-body capture-view">
      <div className="capture-guide"><span>▣</span><div><b>1枚ずつ、正面から撮影</b><small>続けて追加するか、写真から一度に複数枚選べます。</small></div></div>
      <div className="capture-actions"><label><span>●</span><b>カメラで撮影</b><small>撮影後も続けて追加できます</small><input type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={addFiles} /></label><label><span>▧</span><b>写真から複数選択</b><small>最大20枚までまとめて選択</small><input type="file" accept="image/jpeg,image/png,image/webp" multiple onChange={addFiles} /></label></div>
      <div className="capture-count"><b>読み取る名刺</b><span>{queue.length} / 20枚</span></div>
      {queue.length === 0 ? <div className="capture-empty">撮影・選択した名刺がここに並びます</div> : <div className="capture-grid">{queue.map((item, index) => <div key={item.id}><img src={item.preview} alt={`${index + 1}枚目の名刺`} /><span>{index + 1}</span><button onClick={() => removeQueue(item.id)} aria-label={`${index + 1}枚目を削除`}>×</button></div>)}</div>}
      <button className="cardbook-primary" onClick={scanCards} disabled={!queue.length}>{queue.length ? `${queue.length}枚をまとめて読み取る` : '名刺を追加してください'}</button>
      <p className="privacy-note">🔒 名刺画像と連絡先は、あなたの個人名刺帳だけに保存されます。</p>
    </div>}

    {mode === 'scan' && <div className="cardbook-body scanning-view"><div className="scan-modal-card" role="status" aria-live="polite"><div className="scan-illustration">▣<i /></div><h2>{queue.length}枚を読み取っています</h2><p>{progress.card}枚目 / {queue.length}枚 · {progress.percent}%</p><span><i style={{ width: `${((progress.card - 1 + progress.percent / 100) / queue.length) * 100}%` }} /></span><small>読み取りが終わると、結果を確認・修正できます。画面を閉じずにお待ちください。</small></div></div>}

    {mode === 'review' && drafts[reviewIndex] && <ReviewCard draft={drafts[reviewIndex]} preview={queue.find((item) => item.id === drafts[reviewIndex].queueId)?.preview ?? ''} index={reviewIndex} total={drafts.length} onChange={updateDraft} onPrevious={() => setReviewIndex((value) => Math.max(0, value - 1))} onNext={() => setReviewIndex((value) => Math.min(drafts.length - 1, value + 1))} onConfirm={() => setMode('confirm')} />}

    {mode === 'confirm' && <RegistrationConfirm drafts={drafts} queue={queue} busy={busy} onEdit={(index) => { setReviewIndex(index); setMode('review'); }} onSave={saveDrafts} />}

    {mode === 'complete' && <RegistrationComplete count={savedCount} onList={() => setMode('list')} onContinue={() => setMode('capture')} />}

    {mode === 'detail' && selected && <CardDetail card={selected} editing={editing} busy={busy} onEditing={setEditing} onChange={setSelected} onSave={saveSelected} onFavorite={() => toggleFavorite(selected)} onDelete={deleteSelected} onNotice={onNotice} />}
  </section></div>;
}

function ReviewCard({ draft, preview, index, total, onChange, onPrevious, onNext, onConfirm }: {
  draft: DraftCard; preview: string; index: number; total: number; onChange: (field: keyof BusinessCardInput, value: string | boolean) => void; onPrevious: () => void; onNext: () => void; onConfirm: () => void;
}) {
  return <div className="cardbook-body review-view"><div className="review-progress"><b>{index + 1} / {total}枚目</b><span>{Array.from({ length: total }).map((_, item) => <i className={item === index ? 'active' : ''} key={item} />)}</span></div><img className="review-image" src={preview} alt={`${index + 1}枚目の名刺`} /><p className="review-guide">読み取り間違いを直接修正できます。</p><CardFields card={draft} onChange={onChange} /><div className="review-nav"><button onClick={onPrevious} disabled={index === 0}>‹ 前の名刺</button>{index < total - 1 ? <button className="next" onClick={onNext}>次の名刺 ›</button> : <button className="next" onClick={onConfirm}>登録内容を確認 ›</button>}</div></div>;
}

function RegistrationConfirm({ drafts, queue, busy, onEdit, onSave }: { drafts: DraftCard[]; queue: QueueItem[]; busy: boolean; onEdit: (index: number) => void; onSave: () => void }) {
  return <div className="cardbook-body registration-confirm"><div className="confirm-guide"><span>✓</span><div><b>{drafts.length}枚の読み取り結果</b><small>名前・会社・連絡先を確認してから登録してください。</small></div></div><div className="confirm-cards">{drafts.map((draft, index) => <article key={draft.queueId}><img src={queue.find((item) => item.id === draft.queueId)?.preview ?? ''} alt={`${index + 1}枚目の名刺`} /><div><small>{index + 1}枚目</small><h3>{draft.name || '氏名未入力'}</h3><b>{draft.company || '会社名未入力'}</b><p>{[draft.positionTitle, draft.mobile || draft.phone, draft.email].filter(Boolean).join(' · ') || '詳細情報未入力'}</p></div><button onClick={() => onEdit(index)}>修正</button></article>)}</div><button className="cardbook-primary confirm-save" onClick={onSave} disabled={busy}>{busy ? '登録しています…' : `この内容で${drafts.length}枚を登録する`}</button><p className="privacy-note">登録後は個人名刺帳からいつでも編集できます。</p></div>;
}

function RegistrationComplete({ count, onList, onContinue }: { count: number; onList: () => void; onContinue: () => void }) {
  return <div className="cardbook-body registration-complete"><span>✓</span><h2>名刺を登録しました</h2><p>{count}枚の名刺を個人名刺帳に保存しました。</p><button className="cardbook-primary" onClick={onList}>名刺帳で確認する</button><button className="complete-secondary" onClick={onContinue}>続けて名刺を読み取る</button></div>;
}

function CardDetail({ card, editing, busy, onEditing, onChange, onSave, onFavorite, onDelete, onNotice }: {
  card: BusinessCard; editing: boolean; busy: boolean; onEditing: (value: boolean) => void; onChange: (card: BusinessCard) => void; onSave: (card: BusinessCard) => void; onFavorite: () => void; onDelete: () => void; onNotice: (message: string) => void;
}) {
  return <div className="cardbook-body detail-view"><img className="detail-card-image" src={card.imageUrl} alt={`${card.name || '登録済み'}の名刺`} /><div className="detail-person"><button className={card.isFavorite ? 'card-star active' : 'card-star'} onClick={onFavorite}>★</button><div><h2>{card.name || '氏名未登録'}</h2><b>{card.positionTitle || '肩書き未登録'}</b><p>{card.company || '会社名未登録'}</p></div><button className="edit-card" onClick={() => onEditing(!editing)}>{editing ? '中止' : '編集'}</button></div>
    {editing ? <><CardFields card={card} onChange={(field, value) => onChange({ ...card, [field]: value })} /><button className="cardbook-primary" onClick={() => onSave(card)} disabled={busy}>{busy ? '保存中…' : '変更を保存する'}</button></> : <>
      <div className="contact-actions">{card.mobile && <a href={`tel:${card.mobile}`}><span>☎</span><b>携帯に電話</b></a>}{card.phone && <a href={`tel:${card.phone}`}><span>☎</span><b>会社に電話</b></a>}{card.email && <a href={`mailto:${card.email}`}><span>✉</span><b>メール</b></a>}{card.address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`} target="_blank" rel="noreferrer"><span>⌖</span><b>地図</b></a>}</div>
      <dl className="detail-data">{card.department && <div><dt>部署</dt><dd>{card.department}</dd></div>}{card.mobile && <div><dt>携帯電話</dt><dd>{card.mobile}</dd></div>}{card.phone && <div><dt>会社電話</dt><dd>{card.phone}</dd></div>}{card.email && <div><dt>メール</dt><dd>{card.email}</dd></div>}{(card.postalCode || card.address) && <div><dt>住所</dt><dd>{card.postalCode && `〒${card.postalCode} `}{card.address}</dd></div>}{card.website && <div><dt>Webサイト</dt><dd><a href={normalizeUrl(card.website)} target="_blank" rel="noreferrer">{card.website}</a></dd></div>}<div><dt>グループ</dt><dd>{card.groupName || '未設定'}</dd></div><div><dt>名刺の交換日</dt><dd>{formatDate(card.exchangeDate)}</dd></div><div><dt>メモ</dt><dd>{card.memo || 'メモはありません'}</dd></div></dl>
      <div className="detail-tools"><button onClick={() => shareCard(card, onNotice)}>共有する</button><button onClick={() => downloadVCard(card)}>端末の連絡先に保存</button><button className="danger" onClick={onDelete} disabled={busy}>名刺を削除</button></div>
    </>}
  </div>;
}

function CardFields({ card, onChange }: { card: BusinessCardInput; onChange: (field: keyof BusinessCardInput, value: string | boolean) => void }) {
  const field = (key: keyof BusinessCardInput, label: string, placeholder = '') => <label>{label}<input value={String(card[key] ?? '')} maxLength={key === 'memo' ? 500 : 180} placeholder={placeholder} onChange={(event) => onChange(key, event.target.value)} /></label>;
  return <div className="card-fields"><div className="field-row">{field('name', '氏名', '山田 太郎')}{field('company', '会社・屋号', '株式会社〇〇')}</div><div className="field-row">{field('positionTitle', '役職・肩書き')}{field('department', '部署')}</div><div className="field-row">{field('mobile', '携帯電話')}{field('phone', '会社電話')}</div>{field('email', 'メールアドレス')}{field('postalCode', '郵便番号', '000-0000')}{field('address', '住所')}{field('website', 'Webサイト')}{field('groupName', 'グループ', '例：ひるのめぐろ会場')}{field('exchangeDate', '名刺の交換日')}{field('memo', 'メモ', '次に話したいことなど')}</div>;
}

function formatDate(value: string) { const [year, month, day] = value.split('-'); return `${year}年${Number(month)}月${Number(day)}日`; }
function normalizeUrl(value: string) { return /^https?:\/\//i.test(value) ? value : `https://${value}`; }

async function shareCard(card: BusinessCard, notice: (message: string) => void) {
  const text = `${card.name}\n${card.company}\n${card.positionTitle}\n${card.mobile || card.phone}\n${card.email}`.trim();
  if (navigator.share) { try { await navigator.share({ title: `${card.name}さんの名刺`, text }); } catch { /* user cancelled */ } }
  else { await navigator.clipboard.writeText(text); notice('名刺情報をコピーしました。'); }
}

function downloadVCard(card: BusinessCard) {
  const content = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${card.name}`, `ORG:${card.company}`, `TITLE:${card.positionTitle}`, card.mobile && `TEL;TYPE=CELL:${card.mobile}`, card.phone && `TEL;TYPE=WORK:${card.phone}`, card.email && `EMAIL:${card.email}`, card.address && `ADR;TYPE=WORK:;;${card.address}`, card.website && `URL:${normalizeUrl(card.website)}`, `NOTE:${card.memo}`, 'END:VCARD'].filter(Boolean).join('\r\n');
  const url = URL.createObjectURL(new Blob([content], { type: 'text/vcard;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = `${card.name || 'contact'}.vcf`; link.click(); URL.revokeObjectURL(url);
}
