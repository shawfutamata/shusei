'use client';
import {useEffect,useState} from 'react';
import type {Meeting} from './types';
import {GoogleMark} from '@/app/login/LoginForm';
export default function MeetingSignup({event,requests=false}:{event:Meeting;requests?:boolean}) {
 const [email,setEmail]=useState(''),[code,setCode]=useState(''),[sent,setSent]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{
  const receipt=window.location.hash.match(/^#receipt=([a-f0-9]{64})$/)?.[1];
  if(receipt){try{localStorage.setItem(`tasuki-meeting-${event.id}`,receipt);}catch{}}
  if(new URLSearchParams(window.location.search).has('login'))setError('認証できませんでした。もう一度進むか、メールをご利用ください。');
 },[event.id]);
 const back=`/meeting/${event.id}${requests?'/requests':''}`;
 async function send(action:'request'|'verify') {
  setBusy(true);setError('');
  try {const response=await fetch(`/api/meeting/${event.id}/account`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,email,code,consent:true})});const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error||'登録できませんでした。');if(action==='request')setSent(true);else window.location.reload();}
  catch(e){setError(e instanceof Error?e.message:'もう一度お試しください。');}finally{setBusy(false);}
 }
 return <main className="meeting-page meeting-survey meeting-signup"><p className="meeting-eyebrow">ひるのめぐろ</p><p>{event.title}</p><h1>今日の出会いを、<br/>仕事につなげる。</h1><section className="meeting-signup-form"><h2>アンケートへ進む</h2><p>Googleまたはメールでかんたん登録。<br/>登録済みの方もこちらから進めます。</p>
 <a className="meeting-google" href={`/api/auth/google/start?meeting=${encodeURIComponent(event.id)}&return_to=${encodeURIComponent(back)}`}><GoogleMark/>Googleで進む</a>
 <div className="meeting-auth-divider">またはメールで</div>
 <form onSubmit={e=>{e.preventDefault();void send(sent?'verify':'request');}}><label htmlFor="meeting-email">メールアドレス</label><input id="meeting-email" type="email" autoComplete="email" required maxLength={254} value={email} disabled={sent||busy} onChange={e=>setEmail(e.target.value)}/>
 {sent&&<><label htmlFor="meeting-code">メールに届いた6桁のコード</label><input id="meeting-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value.replace(/[^0-9]/g,''))}/><p className="meeting-help">コードの有効期限は10分です。</p></>}
 {error&&<p role="alert" className="meeting-auth-error">{error}</p>}<button className="meeting-submit" type="submit" disabled={busy}>{busy?'確認中…':sent?'認証してアンケートへ':'メールで進む'}</button>
 {sent&&<div className="meeting-auth-actions"><button type="button" disabled={busy} onClick={()=>{setSent(false);setCode('');setError('');}}>メールを変更</button><button type="button" disabled={busy} onClick={()=>void send('request')}>コードを再送</button></div>}</form>
 <p className="meeting-auth-legal">初めての方は、認証するとTASUKIの無料アカウントが作成されます。登録後は、そのままアンケートが開きます。<br/><a href="/terms" target="_blank">利用規約</a>・<a href="/privacy" target="_blank">プライバシーポリシー</a>に同意して進む。</p></section></main>;
}
