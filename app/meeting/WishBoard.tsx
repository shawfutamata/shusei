'use client';
import {useEffect,useState} from 'react';
import type {CSSProperties} from 'react';
import {getIndustryIconSource} from '../industry-options';
import type {Meeting} from './types';
type Person={id:string;name:string;company:string;industry:string;need:string};
export default function WishBoard({event}:{event:Meeting}) {
 const [people,setPeople]=useState<Person[]>([]),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState(''),[expanded,setExpanded]=useState<Set<string>>(new Set());
 useEffect(()=>{let disposed=false;
   async function load(){try{let token='';try{token=localStorage.getItem(`tasuki-meeting-${event.id}`)||'';}catch{}
     const r=await fetch(`/api/meeting/${event.id}/requests`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const d=await r.json() as {people:Person[];error?:string};if(!r.ok)throw new Error(d.error);if(!disposed){setPeople(d.people);setMessage('');}}
     catch(e){if(!disposed)setMessage(e instanceof Error?e.message:'読み込めませんでした。');}finally{if(!disposed)setLoading(false);}}
   void load();const timer=setInterval(()=>void load(),15000);return()=>{disposed=true;clearInterval(timer);};
 },[event.id]);
 const visible=people.filter(p=>`${p.name} ${p.company} ${p.industry} ${p.need}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <main className="meeting-page meeting-survey meeting-wish-board"><section className="meeting-shell">
   <a className="meeting-wish-back" href={`/meeting/${event.id}`}><span aria-hidden="true">←</span> 自分の結果に戻る</a>
   <div className="meeting-wish-heading"><div><p className="meeting-eyebrow">{event.venue}{event.title!==event.venue&&` · ${event.title}`}</p><h1>参加者の希望</h1><p>あなたのつながりが、誰かの仕事につながる。</p></div><svg className="meeting-wish-heading-icon" viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="16" r="6"/><path d="M6 38v-4a12 12 0 0 1 24 0v4M32 10a6 6 0 0 1 0 12m4 5a10 10 0 0 1 6 9v2"/></svg></div>
   <div className="meeting-wish-search"><label htmlFor="meeting-wish-query">業種・会社名・お名前で探す</label><div className="meeting-wish-input"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></svg><input id="meeting-wish-query" type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例：建築、飲食店"/></div></div>
   {loading?<div className="meeting-wish-empty" role="status">参加者の希望を読み込んでいます…</div>:message?<div className="meeting-wish-empty" role="status"><h2>一覧を表示できませんでした</h2><p>{message}</p></div>:<>
    <div className="meeting-wish-list-heading"><h2>{query.trim()?'検索結果':'みなさんが探している相手'}</h2><p role="status"><strong>{visible.length}</strong>人{query.trim()&&<span> ／ 全{people.length}人</span>}</p></div>
    <div className="meeting-wish-grid">{visible.map(p=><article className={`meeting-wish-card${expanded.has(p.id)?' is-expanded':''}`} key={p.id}>
      <div className="meeting-wish-card-label"><span>希望する相手</span>{p.need.startsWith('【テスト回答】')&&<small className="meeting-wish-test">テスト回答</small>}</div>
      <p id={`wish-${p.id}`} className="meeting-wish-card-text">{p.need.replace(/^【テスト回答】\s*/, '')}</p>
      <div className="meeting-wish-card-person"><span className="meeting-wish-person-mark" aria-hidden="true">{p.name.slice(0,1)}</span><div><h3>{p.name}<small>さん</small></h3><p>{p.company}</p>{p.industry?.trim()&&<span className="meeting-wish-industry" title={p.industry}><i className="industry-icon" style={{'--icon':`url(${getIndustryIconSource(p.industry)})`} as CSSProperties} aria-hidden="true"/><span>{p.industry}</span></span>}</div></div>
      {p.need.replace(/^【テスト回答】\s*/, '').length>32&&<button type="button" className="meeting-wish-expand" aria-expanded={expanded.has(p.id)} aria-controls={`wish-${p.id}`} onClick={()=>setExpanded(previous=>{const next=new Set(previous);if(next.has(p.id))next.delete(p.id);else next.add(p.id);return next;})}>{expanded.has(p.id)?'閉じる':'全文を見る'}<span aria-hidden="true">{expanded.has(p.id)?'−':'＋'}</span></button>}
    </article>)}</div>
    {!visible.length&&<div className="meeting-wish-empty"><h2>{people.length?'該当する希望はありません':'希望はまだ掲載されていません'}</h2><p>{people.length?'別の業種や短い言葉で探してみてください。':'参加者が希望を掲載すると、ここに表示されます。'}</p>{query.trim()&&<button type="button" className="meeting-secondary" onClick={()=>setQuery('')}>すべての希望を見る</button>}</div>}
    <p className="meeting-wish-note">紹介できそうな方が思い浮かんだら、ご本人や受付係に声をかけてみてください。</p>
   </>}
 </section></main>;
}
