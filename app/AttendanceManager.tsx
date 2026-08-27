'use client';

import { ChangeEvent, useEffect, useMemo, useState } from 'react';
import type { AttendanceEvent, AttendancePerson } from '@/db/data';

type DraftPerson = {
  tempId: string;
  personName: string;
  company: string;
  note: string;
  isImportant: boolean;
};

export default function AttendanceManager({ view, defaultVenue, onNotice }: {
  view: 'attendance' | 'important';
  defaultVenue: string;
  onNotice: (message: string) => void;
}) {
  const [events, setEvents] = useState<AttendanceEvent[]>([]);
  const [importantPeople, setImportantPeople] = useState<AttendancePerson[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [draftOpen, setDraftOpen] = useState(false);
  const [meetingDate, setMeetingDate] = useState(todayInJapan());
  const [meetingName, setMeetingName] = useState('守成クラブ例会');
  const [venue, setVenue] = useState(defaultVenue);
  const [ocrText, setOcrText] = useState('');
  const [draftPeople, setDraftPeople] = useState<DraftPerson[]>([]);
  const [expandedEvent, setExpandedEvent] = useState<string>('');

  useEffect(() => { void loadAttendance(); }, []);

  const totalPeople = useMemo(() => events.reduce((sum, event) => sum + event.people.length, 0), [events]);

  async function loadAttendance() {
    setLoading(true);
    const response = await fetch('/api/attendance');
    if (response.ok) {
      const data = await response.json() as { events: AttendanceEvent[]; importantPeople: AttendancePerson[] };
      setEvents(data.events); setImportantPeople(data.importantPeople);
      setExpandedEvent((current) => current || data.events[0]?.id || '');
    }
    setLoading(false);
  }

  function beginManualEntry() {
    setDraftOpen(true); setOcrText(''); setDraftPeople([emptyDraft()]);
  }

  async function scanRoster(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return onNotice('名簿の写真を選んでください。');
    if (file.size > 12 * 1024 * 1024) return onNotice('名簿写真は12MB以下にしてください。');
    setDraftOpen(true); setScanning(true); setScanProgress(0); setDraftPeople([]); setOcrText('');
    let worker: Awaited<ReturnType<(typeof import('tesseract.js'))['createWorker']>> | null = null;
    try {
      const { createWorker } = await import('tesseract.js');
      worker = await createWorker(['jpn', 'eng'], undefined, {
        logger: (message) => {
          if (message.status === 'recognizing text' && typeof message.progress === 'number') setScanProgress(Math.round(message.progress * 100));
        },
      });
      const result = await worker.recognize(file);
      const text = result.data.text.trim();
      const parsed = parseRosterText(text);
      setOcrText(text);
      setDraftPeople(parsed.length ? parsed : [emptyDraft()]);
      onNotice(parsed.length ? `${parsed.length}名を読み取りました。内容を確認してください。` : '文字をうまく読み取れませんでした。手入力で修正してください。');
    } catch {
      setDraftPeople([emptyDraft()]);
      onNotice('読み取りが完了しませんでした。手入力で名簿を作れます。');
    } finally {
      if (worker) await worker.terminate();
      setScanning(false);
    }
  }

  function updateDraft(tempId: string, field: keyof Omit<DraftPerson, 'tempId'>, value: string | boolean) {
    setDraftPeople((current) => current.map((person) => person.tempId === tempId ? { ...person, [field]: value } : person));
  }

  async function saveRoster() {
    const people = draftPeople.map((person) => ({ ...person, personName: person.personName.trim(), company: person.company.trim(), note: person.note.trim() })).filter((person) => person.personName);
    if (!meetingDate || !meetingName.trim() || !venue.trim() || people.length === 0) return onNotice('例会情報と、1名以上の出席者を入力してください。');
    setBusy(true);
    const response = await fetch('/api/attendance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ meetingDate, meetingName, venue, ocrText, people }) });
    const result = await response.json() as { error?: string };
    setBusy(false);
    if (!response.ok) return onNotice(result.error ?? '名簿を保存できませんでした。');
    setDraftOpen(false); setDraftPeople([]); setOcrText(''); await loadAttendance();
    onNotice('例会の出席者名簿を保存しました。');
  }

  async function savePerson(person: AttendancePerson, changes: Partial<Pick<AttendancePerson, 'personName' | 'company' | 'note' | 'isImportant'>>) {
    const next = { ...person, ...changes };
    setEvents((current) => current.map((event) => ({ ...event, people: event.people.map((item) => item.id === person.id ? next : item) })));
    setImportantPeople((current) => {
      const without = current.filter((item) => item.id !== person.id);
      return next.isImportant ? [next, ...without] : without;
    });
    const response = await fetch('/api/attendance', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(next) });
    if (!response.ok) { await loadAttendance(); return onNotice('重要人物の更新に失敗しました。'); }
    if (changes.isImportant === undefined) onNotice('重要人物メモを保存しました。');
    else onNotice(next.isImportant ? '重要人物リストに追加しました。' : '重要人物リストから外しました。');
  }

  if (loading) return <div className="roster-loading">名簿を読み込んでいます…</div>;

  if (view === 'important') return (
    <section className="important-view">
      <div className="roster-summary"><span><b>{importantPeople.length}</b><small>重要人物</small></span><p>例会をまたいで、気になる人だけをまとめています。</p></div>
      {importantPeople.length === 0 ? <div className="roster-empty"><b>重要人物はまだいません</b><span>例会名簿の☆を押すと、ここにまとまります。</span></div> : <div className="important-list">{importantPeople.map((person) => <ImportantPerson key={person.id} person={person} onSave={savePerson} />)}</div>}
    </section>
  );

  return (
    <section className="attendance-view">
      <div className="roster-summary"><span><b>{events.length}</b><small>参加例会</small></span><span><b>{totalPeople}</b><small>名簿登録</small></span><p>写真の文字認識は端末内で行います。</p></div>
      {!draftOpen && <div className="roster-actions"><label htmlFor="roster-camera" className="scan-roster-button"><span>▣</span><b>名簿を撮影して読み取る</b><small>正面から、影が入らないように撮影</small><input id="roster-camera" type="file" accept="image/*" capture="environment" onChange={scanRoster} /></label><button onClick={beginManualEntry}>＋ 手入力で名簿を作る</button></div>}
      {draftOpen && <div className="roster-draft">
        <div className="draft-heading"><div><p>NEW ROSTER</p><h3>出席者名簿を作成</h3></div><button onClick={() => setDraftOpen(false)} aria-label="名簿作成を閉じる">×</button></div>
        <div className="meeting-fields"><label>例会日<input type="date" value={meetingDate} onChange={(event) => setMeetingDate(event.target.value)} /></label><label>例会名<input value={meetingName} maxLength={80} onChange={(event) => setMeetingName(event.target.value)} /></label><label className="wide">会場<input value={venue} maxLength={60} onChange={(event) => setVenue(event.target.value)} /></label></div>
        {scanning ? <div className="scan-progress"><span><i style={{ width: `${scanProgress}%` }} /></span><b>名簿を読み取っています… {scanProgress}%</b><small>初回は日本語の文字認識準備に少し時間がかかります</small></div> : <>
          <div className="draft-guide"><b>読み取り結果を確認</b><span>名前や会社名が違う場合は直接修正できます。☆で重要人物に追加できます。</span></div>
          <div className="draft-people">{draftPeople.map((person, index) => <div className="draft-person" key={person.tempId}><button className={person.isImportant ? 'star active' : 'star'} onClick={() => updateDraft(person.tempId, 'isImportant', !person.isImportant)} aria-label={person.isImportant ? '重要人物から外す' : '重要人物にする'}>★</button><span>{index + 1}</span><input aria-label={`${index + 1}人目の名前`} value={person.personName} maxLength={60} placeholder="氏名" onChange={(event) => updateDraft(person.tempId, 'personName', event.target.value)} /><input aria-label={`${index + 1}人目の会社名`} value={person.company} maxLength={100} placeholder="会社・屋号（任意）" onChange={(event) => updateDraft(person.tempId, 'company', event.target.value)} /><button className="remove-person" onClick={() => setDraftPeople((current) => current.filter((item) => item.tempId !== person.tempId))} aria-label={`${index + 1}人目を削除`}>×</button></div>)}</div>
          <button className="add-person" onClick={() => setDraftPeople((current) => [...current, emptyDraft()])}>＋ 出席者を手入力で追加</button>
          <button className="save-roster" onClick={saveRoster} disabled={busy}>{busy ? '保存しています…' : `${draftPeople.filter((person) => person.personName.trim()).length}名の名簿を保存する`}</button>
        </>}
      </div>}
      {!draftOpen && <div className="saved-rosters"><div className="saved-title"><p>SAVED ROSTERS</p><h3>参加した例会</h3></div>{events.length === 0 ? <div className="roster-empty"><b>保存した名簿はまだありません</b><span>名簿の写真を撮ると、その日の出席者リストを作れます。</span></div> : events.map((event) => <article className="event-roster" key={event.id}><button className="event-roster-head" onClick={() => setExpandedEvent((current) => current === event.id ? '' : event.id)}><span>{formatMeetingDate(event.meetingDate)}</span><p><b>{event.meetingName}</b><small>{event.venue} · {event.people.length}名</small></p><i>{expandedEvent === event.id ? '−' : '＋'}</i></button>{expandedEvent === event.id && <div className="event-people">{event.people.map((person) => <div key={person.id}><button className={person.isImportant ? 'star active' : 'star'} onClick={() => savePerson(person, { isImportant: !person.isImportant })} aria-label={person.isImportant ? '重要人物から外す' : '重要人物にする'}>★</button><p><b>{person.personName}</b><small>{person.company || '会社名未登録'}</small></p></div>)}</div>}</article>)}</div>}
    </section>
  );
}

function ImportantPerson({ person, onSave }: { person: AttendancePerson; onSave: (person: AttendancePerson, changes: Partial<AttendancePerson>) => Promise<void> }) {
  const [note, setNote] = useState(person.note);
  return <article className="important-person"><button className="star active" onClick={() => onSave(person, { isImportant: false })} aria-label="重要人物から外す">★</button><div><h3>{person.personName}</h3><p>{person.company || '会社名未登録'}</p><small>{formatMeetingDate(person.meetingDate)} · {person.meetingName} · {person.venue}</small><div className="important-note"><input value={note} maxLength={240} placeholder="次に話したいこと・メモ" onChange={(event) => setNote(event.target.value)} /><button onClick={() => onSave(person, { note })}>保存</button></div></div></article>;
}

function emptyDraft(): DraftPerson {
  return { tempId: crypto.randomUUID(), personName: '', company: '', note: '', isImportant: false };
}

function parseRosterText(text: string): DraftPerson[] {
  const heading = /^(出席者|出席者名簿|参加者|参加者名簿|氏名|お名前|会社名|企業名|会場|例会|名簿|番号|no\.?|合計)$/i;
  return text.replace(/\r/g, '').split('\n').map((line) => line.replace(/[＿_]{2,}/g, ' ').replace(/\s+$/g, '').trim()).filter((line) => line.length >= 2 && !heading.test(line)).slice(0, 120).map((line) => {
    const cells = line.split(/\t+|\s{2,}|[|｜]/).map((cell) => cell.trim()).filter(Boolean);
    while (cells.length && /^[\d０-９]{1,3}[.．、:：)]?$/.test(cells[0])) cells.shift();
    if (!cells.length) return null;
    let personName = cells[0];
    let company = cells.slice(1).join(' ');
    if (cells.length >= 2 && looksLikeCompany(cells[0]) && !looksLikeCompany(cells[1])) {
      company = cells[0]; personName = cells.slice(1).join(' ');
    }
    return { ...emptyDraft(), personName, company };
  }).filter((person): person is DraftPerson => Boolean(person?.personName));
}

function looksLikeCompany(value: string) {
  return /(株式会社|有限会社|合同会社|一般社団|法人|事務所|商店|サロン|クリニック|工業|企画|サービス|company|inc\.?|llc)/i.test(value);
}

function todayInJapan() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

function formatMeetingDate(value: string) {
  const [year, month, day] = value.split('-');
  return `${year}.${month}.${day}`;
}
