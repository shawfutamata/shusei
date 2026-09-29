'use client';
import { useEffect,useState } from 'react';
import MeetingResult from './MeetingResult';
import type {MeetingProfile} from '@/db/meeting-accounts';
import type { Answer,Candidate,Meeting,RosterPerson } from './types';
const empty:Answer={name:'',company:'',table:'',industry:'',services:'',referrals:'',need:'',area:'',timing:'',budget:'',conditions:''};
type Result={event:Meeting;answer:Answer;rosterId:string;walkIn?:boolean;shareWish:boolean;present:number;matches:(Candidate & {name:string;company:string;table:string;industry:string})[]};
export default function MeetingForm({event:initial,profile}:{event:Meeting;profile:MeetingProfile}) {
  const [event,setEvent]=useState(initial),[answer,setAnswer]=useState<Answer>({...empty,...profile.profile}),[token,setToken]=useState('');
  const [selected,setSelected]=useState<RosterPerson|null>(profile.rosterId?{...profile.profile,id:profile.rosterId}:null),[walkIn,setWalkIn]=useState(profile.walkIn);
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [result,setResult]=useState<Result|null>(null),[now,setNow]=useState(0),[restore,setRestore]=useState(''),[editing,setEditing]=useState(false);
  const storageKey=`tasuki-meeting-${event.id}`;
  useEffect(()=>{const timer=setTimeout(()=>{let key='';try{key=localStorage.getItem(storageKey)||'';}catch{};const receipt=location.hash.match(/^#receipt=([a-f0-9]{64})$/)?.[1];if(receipt){key=receipt;history.replaceState(null,'',location.pathname);}setNow(Date.now());setToken(key||Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''));},0);return()=>clearTimeout(timer);},[storageKey]);
  useEffect(()=>{
    if(!token) return;
    let disposed=false;
    async function refresh(){
      try{const r=await fetch(`/api/meeting/${event.id}?mine=1`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(r.ok){const data=await r.json() as Result;if(!disposed){setResult(data);setEvent(data.event);if(!editing){setAnswer(data.answer);setWalkIn(!!data.walkIn);if(data.rosterId)setSelected({...data.answer,id:data.rosterId});}try{localStorage.setItem(storageKey,token);}catch{}}}
      else if(r.status===404){const status=await fetch(`/api/meeting/${event.id}`,{cache:'no-store'});if(status.ok){const data=await status.json() as {event:Meeting};if(!disposed)setEvent(data.event);}}}
      catch{/* Preserve receipt and let the user retry. */}
    }
    void refresh(); const timer=setInterval(()=>{setNow(Date.now());void refresh();},15000);
    return()=>{disposed=true;clearInterval(timer);};
  },[token,event.id,storageKey,editing]);
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);setMessage('');
    try{
      try{localStorage.setItem(storageKey,token);}catch{}
      const r=await fetch(`/api/meeting/${event.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(walkIn?{walkIn:true,answer,token,consent,website:''}:{rosterId:selected?.id,need:answer.need,token,consent,website:''})});
      const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error);
      const own=await fetch(`/api/meeting/${event.id}?mine=1`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(!own.ok)throw new Error('回答は送信されました。結果を更新してください。');
      setResult(await own.json() as Result);setEditing(false);if(result)setMessage('希望を更新しました。');
    }catch(error){setMessage(error instanceof Error?error.message:'通信できませんでした。再試行してください。');}finally{setBusy(false);}
  }
  async function shareWish(shared:boolean){
    setBusy(true);setMessage('');
    try{const r=await fetch(`/api/meeting/${event.id}/requests`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({shared})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);setResult(prev=>prev?{...prev,shareWish:shared}:prev);setMessage(shared?'希望の掲載を設定しました。':'希望の掲載を取り消しました。');}
    catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした。');}finally{setBusy(false);}
  }
  const closed=now>=event.closesAt||event.state!=='open';
  return <main className={`meeting-page meeting-survey${result&&!editing?' meeting-results':''}`}><section className="meeting-shell">
    {(!result||editing)&&<><p className="meeting-eyebrow">{event.venue} · {event.title}</p><h1>{editing?'希望を編集する':'今日、つながりたい相手は？'}</h1></>}
    {(!result||editing)?<><p className="meeting-lead">{editing?`${answer.name}さんの希望を変更できます。`:'つながりたい業種や、一緒に進めたい仕事をひと言。'}</p><p className="meeting-help">受付締切：{new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
    {closed?<p role="status">受付は締め切りました。回答済みの方は、この下から結果を開けます。</p>:<form onSubmit={submit}><fieldset disabled={!token||busy}>
      <div className="meeting-survey-identity"><strong>{answer.name}さん</strong><span>{answer.company}</span><details><summary>事業内容を確認</summary><p>{answer.services}</p></details></div>
      {(selected||walkIn)&&<>
        <label>{editing?'どんな業種・相手とつながりたいですか？':'どんな業種・相手とつながりたいですか？'}<textarea rows={3} maxLength={500} value={answer.need} onChange={e=>setAnswer({...answer,need:e.target.value})} placeholder="例：内装工事の職人さん／飲食店の経営者。目的があればひと言添えてください。"/></label>
        <p className="meeting-help">業種名だけでも大丈夫。特に希望がなければ空欄で送れます。</p>
        <label className="meeting-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>事業情報・回答をAIで分析し、当日の紹介候補とTASUKIの会員候補を探すことに同意します。</span></label>
        <p className="meeting-help">連絡先・顧客名などは書かないでください。<a href="/privacy">個人情報の取り扱い</a></p>
        <div className="meeting-actions">{editing&&<button type="button" className="meeting-secondary" disabled={busy} onClick={()=>{setAnswer(result!.answer);setEditing(false);setMessage('');}}>変更をやめる</button>}<button disabled={busy||!token}>{busy?'保存しています…':editing?'希望を更新する':'回答を送信する'}</button></div>
      </>}
    </fieldset></form>}
    <details><summary>回答済みの方：回答用キーで結果を開く</summary><label>回答用キー<input value={restore} onChange={e=>setRestore(e.target.value.trim())}/></label><button onClick={()=>{if(/^[a-f0-9]{64}$/.test(restore)){setToken(restore);setMessage('回答が見つからない場合はキーをご確認ください。');}else setMessage('64文字の回答用キーを入力してください。');}}>結果を開く</button></details></>:<>
      <MeetingResult event={event} result={result} token={token} busy={busy} closed={closed} onShare={shareWish} onEdit={()=>{setEditing(true);setConsent(true);setMessage('');}} onMessage={setMessage}/>
    </>}{message&&<p role="status" className="meeting-error">{message}</p>}
  </section></main>;
}
