'use client';
import { useEffect, useState } from 'react';
import type { Meeting, Attendee, RosterPerson } from '@/app/meeting/types';
import RosterImport from './RosterImport';
import AutomationPanel from './AutomationPanel';
const labels={open:'受付中',analyzing:'分析中',review:'候補確認',published:'公開済み'};
export default function MeetingAdmin() {
  const [events,setEvents]=useState<Meeting[]>([]), [event,setEvent]=useState<Meeting|null>(null), [people,setPeople]=useState<Attendee[]>([]),[roster,setRoster]=useState<RosterPerson[]>([]),[qrTables,setQrTables]=useState(8);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[origin,setOrigin]=useState(''),[now,setNow]=useState(0);
  useEffect(()=>{const update=()=>setNow(Date.now());const start=setTimeout(update,0),timer=setInterval(update,1000);return()=>{clearTimeout(start);clearInterval(timer);};},[]);
  async function request(body?:Record<string,unknown>,id?:string) {
    const r=await fetch('/api/admin/meetings'+(id?'?id='+encodeURIComponent(id):''),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
    const data=await r.json() as {error?:string;event:Meeting;attendees:Attendee[];roster:RosterPerson[];events:Meeting[];id:string;qrTables?:number}; if(!r.ok) throw new Error(data.error||'読み込めませんでした。'); return data;
  }
  function apply(data:{event:Meeting;attendees:Attendee[];roster:RosterPerson[];qrTables?:number}) {setQrTables(data.qrTables??8);setEvent(data.event);setPeople(data.attendees);setRoster(data.roster);}
  useEffect(()=>{request().then(d=>{setEvents(d.events);setOrigin(location.origin);const id=new URLSearchParams(location.search).get('event');if(id)void select(id);}).catch(e=>setError(e.message));},[]);
  async function select(id:string) {setBusy(true);setError('');try{apply(await request(undefined,id));}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function act(action:string,extra:Record<string,unknown>={}) {
    if(!event)return;setBusy(true);setError('');
    try{let data=await request({action,id:event.id,...extra});apply(data);
      while(action==='analyze' && data.event.state==='analyzing'){data=await request({action,id:event.id});apply(data);}
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function create(form:React.FormEvent<HTMLFormElement>) {
    form.preventDefault();const fields=new FormData(form.currentTarget);setBusy(true);setError('');
    try{const d=await request({action:'create',title:fields.get('title'),venue:fields.get('venue'),closesAt:new Date(String(fields.get('closesAt'))+'+09:00').getTime()});setEvents((await request()).events);apply(await request(undefined,d.id));}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  const confirmed=people.filter(p=>p.present===1);
  return <main className="meeting-page"><header><b>TASUKI</b><span>例会アンケート管理</span></header><div className="meeting-shell">
    <a href="/admin">← 管理画面へ</a><h1>本日の仕事を、つなぐ。</h1>
    <p>① 名簿を取り込む → ② アンケートを共有 → ③ 締切後に紹介候補を確認</p>
    <AutomationPanel onCreated={()=>{void request().then(d=>setEvents(d.events));}}/><details><summary>新しい例会を作成</summary><form onSubmit={create}><label>例会名<input name="title" required maxLength={120}/></label><label>会場<input name="venue" required maxLength={120}/></label><label>回答締切（日本時間）<input name="closesAt" type="datetime-local" required/></label><button disabled={busy}>受付URLを作成</button></form></details>
    <label>例会を選択<select value={event?.id||''} disabled={busy} onChange={e=>void select(e.target.value)}><option value="" disabled>選択してください</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
    {error&&<p role="alert" className="meeting-error">{error}　回答は保持されています。再読み込み・再開できます。</p>}
    {event&&<><h2>{event.title}</h2><p>{event.venue} · {event.state==='open'&&now>=event.closesAt?'受付終了':labels[event.state]}<br/>締切：{new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>
    {!event.rosterCount&&event.state==='open'&&people.length===0&&<RosterImport busy={busy} onImport={async profiles=>{setBusy(true);try{apply(await request({action:'import',id:event.id,people:profiles,consent:true}));}finally{setBusy(false);}}}/>}
    {!!event.rosterCount&&<details><summary>本日の名簿 {roster.length}人を確認</summary>{roster.map(p=><p key={p.id}>{p.name} · {p.company} · {p.industry}{p.table&&` ／ ${p.table}`}</p>)}</details>}
    <p className="meeting-link">ログイン不要の受付URL（名簿の取り込み後に共有）<br/><a href={'/meeting/'+event.id} target="_blank" rel="noreferrer">{origin}/meeting/{event.id}</a></p>
    <button className="meeting-secondary" onClick={()=>navigator.clipboard.writeText(origin+'/meeting/'+event.id).catch(()=>setError('URLを選択してコピーしてください。'))}>受付URLをコピー</button>
    <div className="meeting-admin-tools"><a className="meeting-qr-link" href={'/admin/meetings/qr?id='+encodeURIComponent(event.id)} target="_blank" rel="noreferrer">テーブル用QRを印刷 / PDF保存 →</a><label>QRの枚数<input type="number" min="1" max="26" defaultValue={qrTables} key={event.id+qrTables} onBlur={e=>void act('qr-tables',{tables:Number(e.target.value)})}/></label></div><p>名簿 {roster.length}人 ／ 回答 {people.length}人 ／ 出席確認 {confirmed.length}人 ／ 分析済み {confirmed.filter(p=>p.analyzed).length}人</p>
    <p className="meeting-help">1例会100人まで。重複・欠席を確認し、実際に来場した方だけチェックしてください。集計開始後は回答と出席者を固定します。分析中はこの画面を開いたままにしてください。中断した場合は続きから再開できます。</p>
    <div className="meeting-admin-tools"><button disabled={busy} className="meeting-secondary" onClick={()=>void select(event.id)}>回答を再読み込み</button>
    {(event.state==='open'||event.state==='analyzing')&&<button disabled={busy||!confirmed.length||(event.state==='open'&&now<event.closesAt)} onClick={()=>void act('analyze')}>{busy?'処理中…':event.state==='analyzing'?'分析を再開':'締切後に集計・分析する'}</button>}
    {event.state==='review'&&<button disabled={busy} onClick={()=>void act('publish')}>確認した候補を本人に公開する</button>}</div>
    {event.state==='review'&&<p>回答原文と必須条件を確認してください。紹介が難しい候補は外せます。「候補なし」も正常な結果です。</p>}
    {people.map(p=><article className="meeting-admin-row" key={p.id}><label><input type="checkbox" checked={p.present===1} disabled={busy||event.state!=='open'} onChange={e=>void act('attendance',{personId:p.id,present:e.target.checked})}/>{p.name} · {p.company} {p.table&&'／席 '+p.table}</label>{p.walkIn&&<p><b>当日参加・本人入力</b>（お名前と事業内容を受付で確認してください）</p>}
    <p>{p.industry} ／ {p.area||'地域未記入'}</p><p><b>できる仕事：</b>{p.services}</p>{p.referrals&&<p><b>紹介できる相手：</b>{p.referrals}</p>}<p><b>つながりたい相手：</b>{p.need||'今回はなし'}</p>
    {(p.timing||p.budget||p.conditions)&&<p><b>条件：</b>{[p.timing,p.budget,p.conditions].filter(Boolean).join(' ／ ')}</p>}
    {p.analyzed===1&&p.candidates.length===0&&<p>候補なし{!p.need?'（依頼なし）':''}</p>}
    {p.candidates.map(c=>{const other=people.find(x=>x.id===c.id);return <div className="meeting-match" key={c.id}><b>→ {other?.name}（{c.kind==='related'?'関連する仕事の相談':c.kind==='direct'?'直接依頼':'紹介の相談'}）</b><p>{c.reason}</p><blockquote>探す仕事：「{c.needQuote}」<br/>候補の回答：「{c.offerQuote}」</blockquote>{c.questions.length>0&&<p>要確認：{c.questions.join(' ／ ')}</p>}{event.state==='review'&&<button disabled={busy} className="meeting-secondary" onClick={()=>void act('remove',{personId:p.id,candidateId:c.id})}>この候補を外す</button>}</div>;})}</article>)}
    </>}
  </div></main>;
}
