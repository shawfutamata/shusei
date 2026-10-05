 'use client';
import {useEffect,useState} from 'react';
import type {NetworkResult} from '@/db/meeting-network';
import {splitIndustryLabels} from '../industry-options';
export default function MeetingNetwork({eventId,need}:{eventId:string;need:string}) {
 const [retry,setRetry]=useState(0);
 const key=JSON.stringify([eventId,need,retry]);
 const [result,setResult]=useState<{key:string;data:NetworkResult|null;error:string}|null>(null);
 const current=result?.key===key?result:null;
 const data:NetworkResult|null=need.trim()?current?.data??null:{status:'ready',matches:[],searched:0};
 const error=current?.error??'';
 useEffect(()=>{let alive=true,timer:ReturnType<typeof setTimeout>;const controller=new AbortController();
 async function load(){try{const r=await fetch(`/api/meeting/${eventId}/network`,{method:'POST',headers:{'content-type':'application/json'},signal:controller.signal}),d=await r.json() as NetworkResult&{error?:string};if(!r.ok)throw new Error(d.error||'候補を読み込めませんでした。');if(alive){setResult({key,data:d,error:''});if(d.status==='processing')timer=setTimeout(()=>void load(),15000);}}catch(e){if(alive)setResult({key,data:null,error:e instanceof Error?e.message:'候補を確認できませんでした。'});}}
 if(need.trim())void load();return()=>{alive=false;controller.abort();clearTimeout(timer);};},[eventId,need,retry,key]);
 return <section className="meeting-network" aria-labelledby="network-title"><header><span>TASUKI</span><h2 id="network-title">例会の外にも、仕事のつながりを。</h2><p>同じアカウントで、会場外の会員にも相談できます。</p></header>
 {error?<div role="status"><p>{error}</p><button className="meeting-secondary" onClick={()=>setRetry(n=>n+1)}>もう一度確認する</button></div>:!data||data.status==='processing'?<p role="status" className="meeting-network-loading">TASUKI全体から、希望に合う候補を探しています…</p>:data.matches.length?<><p className="meeting-network-count">会場外の候補 <strong>{data.matches.length}人</strong></p><div className="meeting-network-list">{data.matches.map(p=><article key={p.id}><span className="meeting-network-kind">{p.kind==='related'?'関連する仕事':p.kind==='referral'?'紹介を相談':'希望に合う候補'}</span><h3>{p.name}さん</h3><p className="meeting-network-company">{p.company}</p>{p.industry&&<div className="meeting-match-industries">{splitIndustryLabels(p.industry).map(industry=><span key={industry}>{industry}</span>)}</div>}<blockquote>{p.offerQuote}</blockquote><details><summary>つながる理由を見る</summary><p>{p.reason}</p>{!!p.questions.length&&<ul>{p.questions.map(q=><li key={q}>{q}</li>)}</ul>}</details><div className="meeting-network-actions"><a href={`/?contact=${encodeURIComponent(p.id)}`}>メッセージで相談 →</a><a href={`/?member=${encodeURIComponent(p.id)}`}>プロフィール</a></div></article>)}</div></>:need.trim()?<p>会場外でも、今の情報から確かな候補は見つかりませんでした。希望を案件として募集すると、新しい提案が届くきっかけになります。</p>:<p>仕事を探す・頼む・相談する。例会のあともTASUKIを使えます。</p>}
 <aside className="meeting-tasuki-banner meeting-network-banner"><div><img className="meeting-tasuki-logo" src="/lp/hiru-tasuki-logo.png" alt="TASUKI" width={1615} height={557}/><h3>もっと広く、仕事の相手を探す。</h3><p>希望を募集して、会員からのオファーを受け取る。</p></div><a href={`/?action=post&meeting=${encodeURIComponent(eventId)}`}>この希望で仕事を募集 →</a><small className="meeting-tasuki-note">アカウントは作成済み。受注・紹介の可否はご本人とお確かめください。</small></aside></section>;
}
