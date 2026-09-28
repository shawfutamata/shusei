'use client';
import { useEffect,useState } from 'react';
import BrandMark from '../BrandMark';
import type { Answer,Candidate,Meeting,RosterPerson } from './types';
const empty:Answer={name:'',company:'',table:'',industry:'',services:'',referrals:'',need:'',area:'',timing:'',budget:'',conditions:''};
type Result={event:Meeting;answer:Answer;rosterId:string;present:number;matches:(Candidate & {name:string;company:string;table:string;industry:string})[]};
export default function MeetingForm({event:initial}:{event:Meeting}) {
  const [event,setEvent]=useState(initial),[answer,setAnswer]=useState(empty),[token,setToken]=useState('');
  const [selected,setSelected]=useState<RosterPerson|null>(null),[name,setName]=useState(''),[options,setOptions]=useState<RosterPerson[]>([]),[searched,setSearched]=useState(false);
  const [consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [result,setResult]=useState<Result|null>(null),[now,setNow]=useState(0),[restore,setRestore]=useState(''),[editing,setEditing]=useState(false);
  const storageKey=`tasuki-meeting-${event.id}`;
  useEffect(()=>{const timer=setTimeout(()=>{let key='';try{key=localStorage.getItem(storageKey)||'';}catch{};const receipt=location.hash.match(/^#receipt=([a-f0-9]{64})$/)?.[1];if(receipt){key=receipt;history.replaceState(null,'',location.pathname);}setNow(Date.now());setToken(key||Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''));},0);return()=>clearTimeout(timer);},[storageKey]);
  useEffect(()=>{
    if(!token) return;
    let disposed=false;
    async function refresh(){
      try{const r=await fetch(`/api/meeting/${event.id}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(r.ok){const data=await r.json() as Result;if(!disposed){setResult(data);setEvent(data.event);if(!editing){setAnswer(data.answer);if(data.rosterId)setSelected({...data.answer,id:data.rosterId});}try{localStorage.setItem(storageKey,token);}catch{}}}}
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
      const r=await fetch(`/api/meeting/${event.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(event.rosterCount?{rosterId:selected?.id,need:answer.need,token,consent,website:''}:{answer,token,consent,website:''})});
      const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error);
      const own=await fetch(`/api/meeting/${event.id}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(!own.ok)throw new Error('回答は送信されました。結果を更新してください。');
      setResult(await own.json() as Result);setEditing(false);
    }catch(error){setMessage(error instanceof Error?error.message:'通信できませんでした。再試行してください。');}finally{setBusy(false);}
  }
  const closed=now>=event.closesAt||event.state!=='open';
  return <main className="meeting-page meeting-survey"><header><BrandMark/><b>TASUKI</b><span>例会アンケート</span></header><section className="meeting-shell">
    <p className="meeting-eyebrow">{event.venue} · {event.title}</p>
    <h1>{result?'今日の出会いを、仕事につなげる。':'今日、つながりたい相手は？'}</h1>
    {(!result||editing)?<><p className="meeting-lead">お名前を選んで、つながりたい相手をひと言。ログインは不要です。</p><p className="meeting-help">受付締切：{new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
    {closed?<p role="status">受付は締め切りました。回答済みの方は、この下から結果を開けます。</p>:!event.rosterCount?<p>名簿を準備しています。受付係にお声がけください。</p>:<form onSubmit={submit}><fieldset disabled={!token||busy}>
      <label>① お名前を名簿から選ぶ</label>
      {!selected?<><div className="meeting-name-search"><input aria-label="名簿でお名前を検索" autoComplete="name" value={name} onChange={e=>{setName(e.target.value);setOptions([]);setSearched(false);}} placeholder="名簿のお名前をフルネームで" maxLength={120}/><button type="button" disabled={busy||name.trim().length<2} onClick={async()=>{setBusy(true);setMessage('');try{const r=await fetch(`/api/meeting/${event.id}?name=${encodeURIComponent(name)}`,{cache:'no-store'});const d=await r.json() as {error?:string;people:RosterPerson[]};if(!r.ok)throw new Error(d.error);setOptions(d.people);setSearched(true);}catch(e){setMessage(e instanceof Error?e.message:String(e));}finally{setBusy(false);}}}>検索</button></div>
        {options.map(p=><button type="button" className="meeting-person-option" key={p.id} onClick={()=>{setSelected(p);setAnswer({...empty,...p});setConsent(false);}}><b>{p.name}</b><span>{p.company} · {p.industry}{p.table&&` · ${p.table}`}</span></button>)}
        {searched&&!options.length&&<p role="status">名簿に見つかりませんでした。名簿どおりのお名前で検索するか、受付係にお声がけください。</p>}
      </>:<><div className="meeting-selected"><b>{selected.name}さん</b><p>{selected.company}{selected.table&&` · ${selected.table}`}</p><p>{selected.industry}</p><details className="meeting-profile-details"><summary>入力済みの事業内容を見る</summary><p>{selected.services}</p></details><small>事業情報は名簿から入力済みです。違う場合は受付係へ。</small>{!result&&<button type="button" className="meeting-secondary" onClick={()=>{setSelected(null);setOptions([]);setSearched(false);setConsent(false);}}>名前を選び直す</button>}</div>
        <label>② どんな業種・相手とつながりたいですか？<textarea rows={3} maxLength={500} value={answer.need} onChange={e=>setAnswer({...answer,need:e.target.value})} placeholder="例：内装工事の職人さん／飲食店の経営者。目的があればひと言添えてください。"/></label>
        <p className="meeting-help">業種名だけでも大丈夫。特に希望がなければ空欄で送れます。</p>
        <label className="meeting-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>名簿の事業情報・回答をAIで分析し、当日の紹介候補に名前・会社・席・紹介理由を表示することに同意します。</span></label>
        <p className="meeting-help">連絡先・顧客名などは書かないでください。<a href="/privacy">個人情報の取り扱い</a></p>
        <div className="meeting-actions"><button disabled={busy||!token}>{busy?'送信しています…':'回答を送信する'}</button></div>
      </>}
    </fieldset></form>}
    <details><summary>回答済みの方：回答用キーで結果を開く</summary><label>回答用キー<input value={restore} onChange={e=>setRestore(e.target.value.trim())}/></label><button onClick={()=>{if(/^[a-f0-9]{64}$/.test(restore)){setToken(restore);setMessage('回答が見つからない場合はキーをご確認ください。');}else setMessage('64文字の回答用キーを入力してください。');}}>結果を開く</button></details></>:<>
      {event.state!=='published'?<><h2>回答を受け付けました</h2>{!closed&&!!event.rosterCount&&<button className="meeting-secondary" onClick={()=>{setEditing(true);setConsent(false);}}>締切前に回答を修正する</button>}<p>締切後、出席確認ができた方の回答をもとに候補を調べます。運営の確認が終わると、この画面に結果が表示されます。</p>{!result.present&&<p>受付係に出席確認をお願いしてください。</p>}<p className="meeting-help">この画面は15秒ごとに更新されます。結果が出るまで例会をお楽しみください。</p></>:<><h2>本日の紹介候補</h2>{!result.matches.length&&<p>{!result.present?'出席確認ができなかったため、紹介候補はありません。受付係にお声がけください。':!answer.need?'今回は提供できる仕事を受け付けました。条件が合えば、相手の紹介候補に表示されます。':'今回は、回答内容から確かな候補が見つかりませんでした。無理な紹介は行っていません。受付係へのご相談も可能です。'}</p>}{result.matches.map(p=><article className="meeting-match" key={p.id}><small>{p.kind==='direct'?'つながりの候補':'紹介を相談できる候補'}</small><h3>{p.name}さん</h3><p>{p.company} · {p.table||'席は受付係にご確認ください'}</p><p>{p.reason}</p><blockquote>「{p.offerQuote}」</blockquote>{!!p.questions.length&&<><b>まず確認したいこと</b><ul>{p.questions.map(q=><li key={q}>{q}</li>)}</ul></>}<p className="meeting-help">回答に基づく紹介候補です。受注・紹介の可否や条件は、ご本人とお確かめください。</p></article>)}</>}
      <button className="meeting-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'#receipt='+token);setMessage('結果を見る専用リンクをコピーしました。メモに保存し、他の方には渡さないでください。');}catch{setMessage('下の回答用キーを保存してください。');}}}>結果を見るリンクをコピー</button><details><summary>回答用キーを保存する</summary><p>この端末で結果を見られます。別の端末ではこのキーを使ってください。他の方には渡さないでください。</p><code className="meeting-token">{token}</code><button onClick={async()=>{try{await navigator.clipboard.writeText(token);setMessage('回答用キーをコピーしました。');}catch{setMessage('キーを長押ししてコピーしてください。');}}}>キーをコピー</button></details>
      {event.state==='published'&&<aside className="meeting-next"><h2>例会のあとも、仕事のご縁を。</h2><p>例会以外の時間もビジネスをつなげるために、TASUKIを活用してみませんか？ スマホから仕事を探したり、依頼や相談を続けられます。</p><a href="/login#start">TASUKIを使ってみる →</a><small>登録は任意です。アンケート結果の閲覧に登録は必要ありません。</small></aside>}
    </>}{message&&<p role="status" className="meeting-error">{message}</p>}
  </section></main>;
}
