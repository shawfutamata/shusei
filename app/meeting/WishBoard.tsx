'use client';
import {useEffect,useState} from 'react';
import BrandMark from '../BrandMark';
import type {Meeting} from './types';
type Person={id:string;name:string;company:string;need:string};
export default function WishBoard({event}:{event:Meeting}) {
 const [people,setPeople]=useState<Person[]>([]),[message,setMessage]=useState(''),[loading,setLoading]=useState(true),[query,setQuery]=useState('');
 useEffect(()=>{let disposed=false;
   async function load(){try{let token='';try{token=localStorage.getItem(`tasuki-meeting-${event.id}`)||'';}catch{}
     const r=await fetch(`/api/meeting/${event.id}/requests`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});const d=await r.json() as {people:Person[];error?:string};if(!r.ok)throw new Error(d.error);if(!disposed){setPeople(d.people);setMessage('');}}
     catch(e){if(!disposed)setMessage(e instanceof Error?e.message:'読み込めませんでした。');}finally{if(!disposed)setLoading(false);}}
   void load();const timer=setInterval(()=>void load(),15000);return()=>{disposed=true;clearInterval(timer);};
 },[event.id]);
 const visible=people.filter(p=>`${p.name} ${p.company} ${p.need}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
 return <main className="meeting-page meeting-survey"><header><BrandMark/><b>TASUKI</b><span>例会アンケート</span></header><section className="meeting-shell">
   <p className="meeting-eyebrow">{event.venue} · {event.title}</p><h1>参加者の希望</h1><p>「この人なら紹介できるかも」。思い浮かんだら、ご本人や受付係に声をかけてみてください。</p><p className="meeting-help">掲載を希望した、本日出席確認済みの方の回答です。あなたの希望は結果ページで確認できます。</p>
   {loading?<p role="status">読み込んでいます…</p>:message?<p role="status">{message}</p>:<><label>業種・会社名などで絞り込む<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="例：建築、飲食店"/></label><p className="meeting-help">{visible.length}人の希望</p>
   {visible.map(p=><article className="meeting-wish-row" key={p.id}><h2>{p.name}さん</h2><p className="meeting-help">{p.company}</p><p className="meeting-wish-text">{p.need}</p></article>)}{!visible.length&&<p>{people.length?'該当する希望はありません。':'掲載されたほかの参加者の希望は、まだありません。'}</p>}</>}
   <a className="meeting-board-link" href={`/meeting/${event.id}`}>自分の結果・掲載設定に戻る →</a>
 </section></main>;
}
