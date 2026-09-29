'use client';
import { useEffect, useState } from 'react';
import type { Meeting, Attendee, RosterPerson } from '@/app/meeting/types';
import RosterImport from './RosterImport';
import AutomationPanel from './AutomationPanel';
const japanInput=(time:number)=>new Date(time+9*3600000).toISOString().slice(0,16);
const labels={open:'受付中',analyzing:'分析中',review:'候補確認',published:'公開済み'};
export default function MeetingAdmin({embedded=false,initialEventId='',initialView='',onClose,onUpdated}:{embedded?:boolean;initialEventId?:string;initialView?:string;onClose?:()=>void;onUpdated?:()=>void}) {
  const [preview,setPreview]=useState(initialView==='qr'||initialView==='answer'?initialView:'');
  const [events,setEvents]=useState<Meeting[]>([]), [event,setEvent]=useState<Meeting|null>(null), [people,setPeople]=useState<Attendee[]>([]),[roster,setRoster]=useState<RosterPerson[]>([]),[qrTables,setQrTables]=useState(8);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[origin,setOrigin]=useState(''),[now,setNow]=useState(0);
  useEffect(()=>{const update=()=>setNow(Date.now());const start=setTimeout(update,0),timer=setInterval(update,1000);return()=>{clearTimeout(start);clearInterval(timer);};},[]);
  async function request(body?:Record<string,unknown>,id?:string) {
    const r=await fetch('/api/admin/meetings'+(id?'?id='+encodeURIComponent(id):''),body?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{cache:'no-store'});
    const data=await r.json() as {error?:string;event:Meeting;attendees:Attendee[];roster:RosterPerson[];events:Meeting[];id:string;qrTables?:number}; if(!r.ok) throw new Error(data.error||'読み込めませんでした。'); return data;
  }
  function apply(data:{event:Meeting;attendees:Attendee[];roster:RosterPerson[];qrTables?:number}) {setQrTables(data.qrTables??8);setEvent(data.event);setEvents(list=>list.map(e=>e.id===data.event.id?data.event:e));setPeople(data.attendees);setRoster(data.roster);}
  useEffect(()=>{request().then(d=>{setEvents(d.events);setOrigin(location.origin);const id=initialEventId||new URLSearchParams(location.search).get('event');if(id||d.events[0]?.id)void select(id||d.events[0].id);}).catch(e=>setError(e.message));},[]);
  async function select(id:string) {setBusy(true);setError('');try{apply(await request(undefined,id));const url=new URL(location.href);url.searchParams.set('event',id);if(embedded)url.searchParams.set('tab','surveys');history.replaceState(null,'',url);}catch(e){setError(String(e));}finally{setBusy(false);}}
  async function act(action:string,extra:Record<string,unknown>={}) {
    if(!event)return;setBusy(true);setError('');setNotice('');
    try{let data=await request({action,id:event.id,...extra});apply(data);
      while(action==='analyze' && data.event.state==='analyzing'){data=await request({action,id:event.id});apply(data);}
      onUpdated?.();if(action==='update')setNotice('イベント情報を保存しました。');
    }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setBusy(false);}
  }
  async function create(form:React.FormEvent<HTMLFormElement>) {
    form.preventDefault();const fields=new FormData(form.currentTarget);setBusy(true);setError('');
    try{const d=await request({action:'create',title:fields.get('title'),venue:fields.get('venue'),closesAt:new Date(String(fields.get('closesAt'))+'+09:00').getTime()});setEvents((await request()).events);apply(await request(undefined,d.id));onUpdated?.();const url=new URL(location.href);url.searchParams.set('event',d.id);if(embedded)url.searchParams.set('tab','surveys');history.replaceState(null,'',url);}catch(e){setError(String(e));}finally{setBusy(false);}
  }
  useEffect(()=>{if(initialView==='preparation'&&event)document.querySelector('.meeting-admin-preparation')?.scrollIntoView({behavior:'smooth'});},[initialView,event?.id]);
  const confirmed=people.filter(p=>p.present===1);
  return <div className={`meeting-page meeting-admin${embedded?' meeting-admin-embedded':''}`}>{!embedded&&<header><b>TASUKI</b><span>例会アンケート管理</span></header>}<div className="meeting-shell">
    <div className="meeting-admin-breadcrumb">{embedded?<button className="meeting-secondary" onClick={onClose}>← 例会アンケート一覧</button>:<a href="/admin?tab=surveys">← 例会アンケート一覧へ</a>}<span>／ 今回の例会を編集</span></div><h2 className="meeting-admin-title">今回の例会を編集</h2>
    <label className="meeting-admin-selector">編集する例会<select value={event?.id||''} disabled={busy} onChange={e=>{setPreview('');void select(e.target.value);}}><option value="" disabled>選択してください</option>{events.map(e=><option key={e.id} value={e.id}>{e.title}</option>)}</select></label>
    {error&&<p role="alert" className="meeting-error">{error}　回答は保持されています。再読み込み・再開できます。</p>}
    {event&&<>
    <div className="meeting-admin-overview"><div><h2>{event.title}</h2><p>{event.venue} · 締切 {new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p></div><span className="meeting-admin-state">{event.state==='open'&&now>=event.closesAt?'受付終了':labels[event.state]}</span></div>
    {notice&&<p className="meeting-admin-notice" role="status">{notice}</p>}
    <nav className="meeting-admin-nav" aria-label="編集項目"><a href="#meeting-event-info">イベント情報</a><a href="#meeting-reception">受付・締切</a><a href="#meeting-roster">名簿</a><a href="#meeting-sharing">リンク・QR</a><a href="#meeting-analysis">集計・公開</a><a href="#meeting-answers">回答・出席</a></nav>
    {preview&&<section className="meeting-admin-preview" aria-label={preview==='qr'?'QRの印刷プレビュー':'回答画面のプレビュー'}><div><h2>{preview==='qr'?'テーブル用QRの印刷・PDF保存':'参加者の回答画面'}</h2><button className="meeting-secondary" onClick={()=>setPreview('')}>プレビューを閉じる</button></div><p className="meeting-help">{preview==='qr'?'下の「印刷 / PDFで保存」から出力できます。':'参加者が見る画面のプレビューです。'}</p><iframe key={preview+event.id+(preview==='qr'?qrTables:'')} title={preview==='qr'?'テーブル用QR':'参加者の回答画面'} src={preview==='qr'?'/admin/meetings/qr?id='+encodeURIComponent(event.id)+'&embedded=1':'/meeting/'+event.id}/></section>}
    <section id="meeting-event-info" className="meeting-admin-section"><h2>イベント情報を編集</h2><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act('update',{title:f.get('title'),venue:f.get('venue')});}}><div className="meeting-admin-event-fields"><label>例会名<input name="title" required maxLength={120} defaultValue={event.title} key={event.id+event.title}/></label><label>会場<input name="venue" required maxLength={120} defaultValue={event.venue} key={event.id+event.venue}/></label></div>{event.state!=='open'&&<p className="meeting-help">集計開始後は例会名と会場のみ編集できます。</p>}<button disabled={busy}>イベント情報を保存</button></form></section>
    <div className="meeting-admin-grid">
    <section id="meeting-reception" className="meeting-admin-section"><h2>受付・締切</h2><p className="meeting-help">回答できる時間を設定します。</p>
    {event.state==='open'?<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act('deadline',{closesAt:new Date(String(f.get('closesAt'))+'+09:00').getTime()});}}><label>回答締切（日本時間）<input name="closesAt" type="datetime-local" required defaultValue={japanInput(event.closesAt)} key={event.id+event.closesAt}/></label><p className="meeting-help">11:15入場・11:30開始なら、11:45締切で30分間入力できます。集計前なら延長・短縮できます。</p><button disabled={busy}>締切を保存</button><p className="meeting-help">過去の時刻を保存すると受付を終了します。</p></form>:<p className="meeting-help">集計開始後は締切を変更できません。</p>}</section>
    <section id="meeting-roster" className="meeting-admin-section"><h2>参加者の名簿 <small>{roster.length}人</small></h2><p className="meeting-help">回答時に選択する名前・会社・事業内容です。</p>
    {!event.rosterCount&&event.state==='open'&&people.length===0&&<RosterImport busy={busy} onImport={async profiles=>{setBusy(true);try{apply(await request({action:'import',id:event.id,people:profiles,consent:true}));}finally{setBusy(false);}}}/>}
    {!!event.rosterCount&&<details><summary>取り込んだ名簿を確認</summary><div className="meeting-admin-roster">{roster.map(p=><p key={p.id}><b>{p.name}</b><br/>{p.company} · {p.industry}</p>)}</div></details>}
    {!event.rosterCount&&(event.state!=='open'||people.length>0)&&<p className="meeting-help">名簿の取り込みは受付開始前に行ってください。</p>}
    </section></div>
    <section id="meeting-sharing" className="meeting-admin-section"><h2>回答用リンク・テーブル用QR</h2><p className="meeting-help">名簿の取り込み後、このリンクやQRを参加者に共有してください。</p>
    <div className="meeting-admin-share"><div><code className="meeting-admin-url">{origin}/meeting/{event.id}</code><div className="meeting-admin-tools"><button className="meeting-secondary" onClick={()=>navigator.clipboard.writeText(origin+'/meeting/'+event.id).catch(()=>setError('URLを選択してコピーしてください。'))}>回答用リンクをコピー</button><button className="meeting-secondary" onClick={()=>{setPreview('answer');document.querySelector('.meeting-admin-overview')?.scrollIntoView({behavior:'smooth'});}}>回答画面を確認</button></div></div>
    <form className="meeting-admin-qr-form" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);void act('qr-tables',{tables:Number(f.get('tables'))});}}><label>QRの枚数（テーブル数）<input name="tables" type="number" min="1" max="26" required defaultValue={qrTables} key={event.id+qrTables}/></label><button className="meeting-secondary" disabled={busy}>枚数を保存</button><button type="button" className="meeting-secondary" onClick={()=>{setPreview('qr');document.querySelector('.meeting-admin-overview')?.scrollIntoView({behavior:'smooth'});}}>QRを確認・印刷</button></form></div></section>
    <section id="meeting-analysis" className="meeting-admin-section"><h2>集計・結果公開</h2><div className="meeting-admin-counts"><span>回答 <strong>{people.length}</strong>人</span><span>出席確認 <strong>{confirmed.length}</strong>人</span><span>分析済み <strong>{confirmed.filter(p=>p.analyzed).length}</strong>人</span></div>
    <p className="meeting-help">下の回答一覧で来場者を確認 → 締切後に集計 → 候補を確認して公開します。集計開始後は回答と出席者を固定します。</p>
    <div className="meeting-admin-tools">
    {(event.state==='open'||event.state==='analyzing')&&<button disabled={busy||!confirmed.length||(event.state==='open'&&now<event.closesAt)} onClick={()=>void act('analyze')}>{busy?'処理中…':event.state==='analyzing'?'分析を再開':'集計・分析を開始'}</button>}
    {event.state==='open'&&now<event.closesAt&&<span className="meeting-help">回答締切後に集計できます。</span>}
    {event.state==='review'&&<button disabled={busy} onClick={()=>void act('publish')}>確認した候補を本人に公開する</button>}
    {event.state==='published'&&<span>結果を公開しています。</span>}</div>
    {(event.state==='open'||event.state==='analyzing')&&<p className="meeting-help">分析中はこの画面を開いたままにしてください。中断した場合は続きから再開できます。</p>}
    {event.state==='review'&&<p className="meeting-help">回答原文と必須条件を確認し、紹介が難しい候補は外してください。「候補なし」も正常な結果です。</p>}
    </section>
    <section id="meeting-answers" className="meeting-admin-section"><div className="meeting-admin-section-heading"><h2>回答・出席確認 <small>{people.length}人</small></h2><button disabled={busy} className="meeting-secondary" onClick={()=>void select(event.id)}>回答を再読み込み</button></div><p className="meeting-help">実際に来場した方だけチェックしてください。1例会100人まで。</p>
    {people.length===0&&<p className="meeting-admin-empty">まだ回答はありません。回答が届くと、ここに表示されます。</p>}
    {people.map(p=><article className="meeting-admin-row" key={p.id}><label><input type="checkbox" checked={p.present===1} disabled={busy||event.state!=='open'} onChange={e=>void act('attendance',{personId:p.id,present:e.target.checked})}/>{p.name} · {p.company} {p.table&&'／席 '+p.table}</label>{p.walkIn&&<p><b>当日参加・本人入力</b>（お名前と事業内容を受付で確認してください）</p>}
    <p>{p.industry} ／ {p.area||'地域未記入'}</p><p><b>できる仕事：</b>{p.services}</p>{p.referrals&&<p><b>紹介できる相手：</b>{p.referrals}</p>}<p><b>つながりたい相手：</b>{p.need||'今回はなし'}</p>
    {(p.timing||p.budget||p.conditions)&&<p><b>条件：</b>{[p.timing,p.budget,p.conditions].filter(Boolean).join(' ／ ')}</p>}
    {p.analyzed===1&&p.candidates.length===0&&<p>候補なし{!p.need?'（依頼なし）':''}</p>}
    {p.candidates.map(c=>{const other=people.find(x=>x.id===c.id);return <div className="meeting-match" key={c.id}><b>→ {other?.name}（{c.kind==='related'?'関連する仕事の相談':c.kind==='direct'?'直接依頼':'紹介の相談'}）</b><p>{c.reason}</p><blockquote>探す仕事：「{c.needQuote}」<br/>候補の回答：「{c.offerQuote}」</blockquote>{c.questions.length>0&&<p>要確認：{c.questions.join(' ／ ')}</p>}{event.state==='review'&&<button disabled={busy} className="meeting-secondary" onClick={()=>void act('remove',{personId:p.id,candidateId:c.id})}>この候補を外す</button>}</div>;})}</article>)}
    </section></>}
    <section className="meeting-admin-preparation"><h2>次回以降の準備</h2><p className="meeting-help">自動作成の設定や、新しい例会の作成はこちら。</p>
    <details><summary>新しい例会を作成</summary><form onSubmit={create}><label>例会名<input name="title" required maxLength={120}/></label><label>会場<input name="venue" required maxLength={120}/></label><label>回答締切（日本時間）<input name="closesAt" type="datetime-local" required/></label><button disabled={busy}>受付URLを作成</button></form></details>
    <AutomationPanel onOpenMeeting={(id,view)=>{void select(id).then(()=>{setPreview(view||'');document.querySelector('.meeting-admin-breadcrumb')?.scrollIntoView({behavior:'smooth'});});}} onCreated={()=>{onUpdated?.();void request().then(d=>setEvents(d.events));}}/>
    </section>
  </div></div>;
}
