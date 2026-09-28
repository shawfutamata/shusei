'use client';
import { useEffect,useState } from 'react';
import BrandMark from '../BrandMark';
import MeetingResult from './MeetingResult';
import type { Answer,Candidate,Meeting,RosterPerson } from './types';
const empty:Answer={name:'',company:'',table:'',industry:'',services:'',referrals:'',need:'',area:'',timing:'',budget:'',conditions:''};
type Result={event:Meeting;answer:Answer;rosterId:string;walkIn?:boolean;shareWish:boolean;present:number;matches:(Candidate & {name:string;company:string;table:string;industry:string})[]};
export default function MeetingForm({event:initial}:{event:Meeting}) {
  const [event,setEvent]=useState(initial),[answer,setAnswer]=useState(empty),[token,setToken]=useState('');
  const [selected,setSelected]=useState<RosterPerson|null>(null),[options,setOptions]=useState<Pick<RosterPerson,'id'|'name'|'company'>[]>([]),[walkIn,setWalkIn]=useState(false),[loadingNames,setLoadingNames]=useState(true);
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [result,setResult]=useState<Result|null>(null),[now,setNow]=useState(0),[restore,setRestore]=useState(''),[editing,setEditing]=useState(false);
  const storageKey=`tasuki-meeting-${event.id}`;
  useEffect(()=>{const timer=setTimeout(()=>{let key='';try{key=localStorage.getItem(storageKey)||'';}catch{};const receipt=location.hash.match(/^#receipt=([a-f0-9]{64})$/)?.[1];if(receipt){key=receipt;history.replaceState(null,'',location.pathname);}setNow(Date.now());setToken(key||Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''));},0);return()=>clearTimeout(timer);},[storageKey]);
  useEffect(()=>{
    if(!token) return;
    let disposed=false;
    async function refresh(){
      try{const r=await fetch(`/api/meeting/${event.id}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(r.ok){const data=await r.json() as Result;if(!disposed){setResult(data);setEvent(data.event);if(!editing){setAnswer(data.answer);setWalkIn(!!data.walkIn);if(data.rosterId)setSelected({...data.answer,id:data.rosterId});}try{localStorage.setItem(storageKey,token);}catch{}}}}
      catch{/* Preserve receipt and let the user retry. */}
    }
    void refresh(); const timer=setInterval(()=>{setNow(Date.now());void refresh();},15000);
    return()=>{disposed=true;clearInterval(timer);};
  },[token,event.id,storageKey,editing]);
  useEffect(()=>{
    let disposed=false;
    fetch(`/api/meeting/${event.id}?people=1`,{cache:'no-store'}).then(async r=>{const d=await r.json() as {error?:string;people:Pick<RosterPerson,'id'|'name'|'company'>[]};if(!r.ok)throw new Error(d.error);if(!disposed)setOptions(d.people);}).catch(()=>{if(!disposed)setMessage('名簿を読み込めませんでした。ページを更新してください。');}).finally(()=>{if(!disposed)setLoadingNames(false);});
    return()=>{disposed=true;};
  },[event.id]);
  async function choose(personId:string) {
    if(!personId){setSelected(null);setAnswer(empty);return;}
    setBusy(true);setMessage('');setConsent(false);
    try{const r=await fetch(`/api/meeting/${event.id}?rosterId=${encodeURIComponent(personId)}`,{cache:'no-store'});const d=await r.json() as {error?:string;person:RosterPerson};if(!r.ok)throw new Error(d.error);setSelected(d.person);setAnswer({...empty,...d.person});}
    catch(e){setMessage(e instanceof Error?e.message:String(e));setSelected(null);}finally{setBusy(false);}
  }
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault();
    setBusy(true);setMessage('');
    try{
      try{localStorage.setItem(storageKey,token);}catch{}
      const r=await fetch(`/api/meeting/${event.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(walkIn?{walkIn:true,answer,token,consent,website:''}:{rosterId:selected?.id,need:answer.need,token,consent,website:''})});
      const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error);
      const own=await fetch(`/api/meeting/${event.id}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(!own.ok)throw new Error('回答は送信されました。結果を更新してください。');
      setResult(await own.json() as Result);setEditing(false);
    }catch(error){setMessage(error instanceof Error?error.message:'通信できませんでした。再試行してください。');}finally{setBusy(false);}
  }
  async function shareWish(shared:boolean){
    setBusy(true);setMessage('');
    try{const r=await fetch(`/api/meeting/${event.id}/requests`,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`},body:JSON.stringify({shared})});const d=await r.json() as {error?:string};if(!r.ok)throw new Error(d.error);setResult(prev=>prev?{...prev,shareWish:shared}:prev);setMessage(shared?'希望の掲載を設定しました。':'希望の掲載を取り消しました。');}
    catch(e){setMessage(e instanceof Error?e.message:'保存できませんでした。');}finally{setBusy(false);}
  }
  const closed=now>=event.closesAt||event.state!=='open';
  return <main className={`meeting-page meeting-survey${result&&!editing?' meeting-results':''}`}><header><BrandMark/><b>TASUKI</b><span>例会アンケート</span></header><section className="meeting-shell">
    {(!result||editing)&&<><p className="meeting-eyebrow">{event.venue} · {event.title}</p><h1>今日、つながりたい相手は？</h1></>}
    {(!result||editing)?<><p className="meeting-lead">お名前を選んで、つながりたい相手をひと言。ログインは不要です。</p><p className="meeting-help">受付締切：{new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
    {closed?<p role="status">受付は締め切りました。回答済みの方は、この下から結果を開けます。</p>:<form onSubmit={submit}><fieldset disabled={!token||busy}>
      {!walkIn?<><label>① お名前を名簿から選ぶ<select aria-label="お名前を名簿から選ぶ" value={selected?.id??''} disabled={busy||loadingNames||!!result} onChange={e=>void choose(e.target.value)}><option value="">{loadingNames?'名簿を読み込んでいます…':'お名前を選んでください'}</option>{options.map(p=><option key={p.id} value={p.id}>{p.name}（{p.company}）</option>)}</select></label>
      {!result&&<button type="button" className="meeting-secondary" onClick={()=>{setWalkIn(true);setSelected(null);setAnswer(empty);setConsent(false);setMessage('');}}>名簿にない方はこちら（当日参加）</button>}
      {selected&&<div className="meeting-selected"><p>{selected.company}</p><details className="meeting-profile-details"><summary>入力済みの事業内容を見る</summary><p>{selected.services||'名簿に事業内容の記載がありません。紹介先としての判定には使いません。'}</p></details><small>事業情報は名簿から入力済みです。違う場合は受付係へ。</small></div>}
      </>:<><h2>名簿にない方の入力</h2><p className="meeting-help">当日参加の方は、この3項目を入力してください。</p>
        <label>お名前<input autoComplete="name" required maxLength={120} value={answer.name} readOnly={!!result} onChange={e=>setAnswer({...answer,name:e.target.value})}/></label>
        <label>会社名・屋号<input autoComplete="organization" required maxLength={120} value={answer.company} readOnly={!!result} onChange={e=>setAnswer({...answer,company:e.target.value})}/></label>
        <label>できる仕事・事業内容<textarea required rows={2} minLength={2} maxLength={500} value={answer.services} onChange={e=>setAnswer({...answer,services:e.target.value})} placeholder="例：店舗の内装工事・リフォーム"/></label>
        {!result&&<button type="button" className="meeting-secondary" onClick={()=>{setWalkIn(false);setAnswer(empty);setConsent(false);}}>名簿から選ぶ方法に戻る</button>}
      </>}
      {(selected||walkIn)&&<>
        <label>② どんな業種・相手とつながりたいですか？<textarea rows={3} maxLength={500} value={answer.need} onChange={e=>setAnswer({...answer,need:e.target.value})} placeholder="例：内装工事の職人さん／飲食店の経営者。目的があればひと言添えてください。"/></label>
        <p className="meeting-help">業種名だけでも大丈夫。特に希望がなければ空欄で送れます。</p>
        <label className="meeting-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>事業情報・回答をAIで分析し、当日の紹介候補に名前・会社・紹介理由を表示することに同意します。</span></label>
        <p className="meeting-help">連絡先・顧客名などは書かないでください。<a href="/privacy">個人情報の取り扱い</a></p>
        <div className="meeting-actions"><button disabled={busy||!token}>{busy?'送信しています…':'回答を送信する'}</button></div>
      </>}
    </fieldset></form>}
    <details><summary>回答済みの方：回答用キーで結果を開く</summary><label>回答用キー<input value={restore} onChange={e=>setRestore(e.target.value.trim())}/></label><button onClick={()=>{if(/^[a-f0-9]{64}$/.test(restore)){setToken(restore);setMessage('回答が見つからない場合はキーをご確認ください。');}else setMessage('64文字の回答用キーを入力してください。');}}>結果を開く</button></details></>:<>
      <MeetingResult event={event} result={result} token={token} busy={busy} closed={closed} onShare={shareWish} onEdit={()=>{setEditing(true);setConsent(false);}} onMessage={setMessage}/>
    </>}{message&&<p role="status" className="meeting-error">{message}</p>}
  </section></main>;
}
