'use client';
import { useEffect,useState } from 'react';
import BrandMark from '../BrandMark';
import type { Answer,Candidate,Meeting } from './types';
const empty:Answer={name:'',company:'',table:'',industry:'',services:'',referrals:'',need:'',area:'',timing:'',budget:'',conditions:''};
type Result={event:Meeting;answer:Answer;present:number;matches:(Candidate & {name:string;company:string;table:string;industry:string})[]};
export default function MeetingForm({event:initial}:{event:Meeting}) {
  const [event,setEvent]=useState(initial),[answer,setAnswer]=useState(empty),[token,setToken]=useState('');
  const [step,setStep]=useState(0),[consent,setConsent]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
  const [result,setResult]=useState<Result|null>(null),[now,setNow]=useState(0),[restore,setRestore]=useState(''),[editing,setEditing]=useState(false);
  const storageKey=`tasuki-meeting-${event.id}`;
  useEffect(()=>{const timer=setTimeout(()=>{let key='';try{key=localStorage.getItem(storageKey)||'';}catch{};const receipt=location.hash.match(/^#receipt=([a-f0-9]{64})$/)?.[1];if(receipt){key=receipt;history.replaceState(null,'',location.pathname);}setNow(Date.now());setToken(key||Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join(''));},0);return()=>clearTimeout(timer);},[storageKey]);
  useEffect(()=>{
    if(!token) return;
    let disposed=false;
    async function refresh(){
      try{const r=await fetch(`/api/meeting/${event.id}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(r.ok){const data=await r.json() as Result;if(!disposed){setResult(data);setEvent(data.event);if(!editing)setAnswer(data.answer);try{localStorage.setItem(storageKey,token);}catch{}}}}
      catch{/* Preserve receipt and let the user retry. */}
    }
    void refresh(); const timer=setInterval(()=>{setNow(Date.now());void refresh();},15000);
    return()=>{disposed=true;clearInterval(timer);};
  },[token,event.id,storageKey,editing]);
  async function submit(e:React.FormEvent<HTMLFormElement>){
    e.preventDefault(); if(step<2){setStep(step+1);return;}
    setBusy(true);setMessage('');
    try{
      try{localStorage.setItem(storageKey,token);}catch{}
      const r=await fetch(`/api/meeting/${event.id}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({answer,token,consent,website:''})});
      const data=await r.json() as {error?:string};if(!r.ok)throw new Error(data.error);
      const own=await fetch(`/api/meeting/${event.id}`,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
      if(!own.ok)throw new Error('回答は送信されました。結果を更新してください。');
      setResult(await own.json() as Result);setEditing(false);
    }catch(error){setMessage(error instanceof Error?error.message:'通信できませんでした。再試行してください。');}finally{setBusy(false);}
  }
  function field(key:keyof Answer,label:string,placeholder:string,required=false,long=false){return <label key={key}>{label}{!required&&<small>任意</small>}{long?<textarea value={answer[key]} maxLength={500} minLength={required?8:undefined} required={required} onChange={e=>setAnswer({...answer,[key]:e.target.value})} placeholder={placeholder} rows={4}/>:<input value={answer[key]} maxLength={120} required={required} onChange={e=>setAnswer({...answer,[key]:e.target.value})} placeholder={placeholder}/>}</label>;}
  const closed=now>=event.closesAt||event.state!=='open';
  return <main className="meeting-page"><header><BrandMark/><b>TASUKI</b><span>例会アンケート</span></header><section className="meeting-shell">
    <p className="meeting-eyebrow">{event.venue} · {event.title}</p>
    <h1>{result?'今日の出会いを、仕事につなげる。':'今日、どんな仕事の相手を探していますか？'}</h1>
    {(!result||editing)?<><p className="meeting-lead">ログインなしで回答できます。できる仕事と探している仕事を教えてください。</p><p>受付締切：{new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}（日本時間）</p>
    {closed?<p role="status">受付は締め切りました。回答済みの方は、この下から回答用キーを入力してください。</p>:<form onSubmit={submit}><fieldset disabled={!token||busy}>
      <p className="meeting-step">{step+1} / 3　{['ご本人について','できる仕事について','探している仕事について'][step]}</p>
      {step===0&&<>{field('name','お名前','例：山田 太郎',true)}{field('company','会社・屋号','例：山田建設',true)}{field('table','本日のテーブル・席番号','例：3番テーブル')}</>}
      {step===1&&<>{field('industry','ご自身の業種','例：内装工事・リフォーム',true)}{field('services','ご自身ができる仕事・得意な仕事','例：飲食店の内装工事。電気・給排水を含めて施工できます。',true,true)}{field('referrals','紹介できる仕事・業種','例：店舗設計が得意な建築士を紹介できます。ご本人に紹介の確認が取れる範囲でお書きください。',false,true)}{field('area','対応できる地域','例：東京都・神奈川県／全国オンライン対応')}</>}
      {step===2&&<><p className="meeting-help">いま一番探している仕事を1つ、具体的にお書きください。</p>{field('need','今日、探している仕事・業種','例：目黒区の飲食店で、10月末までに厨房の給排水工事を頼める方を探しています。',false,true)}<p className="meeting-help">いま探していない場合は空欄で大丈夫です。仕事の提供側として候補に参加できます。</p>{field('timing','希望時期','例：10月末までに完了／未定')}{field('budget','予算の目安','例：30〜50万円／相談して決めたい')}{field('conditions','必須条件・補足','依頼先に必要な資格、対応してほしい地域、紹介してほしくない内容など。',false,true)}<label className="meeting-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} required/><span>回答を運営が確認し、仕事の内容をCloudflare Workers AIで分析すること、お名前・会社名・席番号・紹介理由を当日の紹介候補となった相手に表示することに同意します。</span></label><p className="meeting-help">連絡先や顧客名などの秘密情報は書かないでください。回答は運営が管理し、外部向けの名簿には公開しません。<a href="/privacy">プライバシーポリシー</a></p></>}
      <div className="meeting-actions">{step>0&&<button type="button" className="meeting-secondary" onClick={()=>setStep(step-1)}>戻る</button>}<button disabled={busy||!token}>{busy?'送信しています…':step<2?'次へ':'回答を送信する'}</button></div>
    </fieldset></form>}
    <details><summary>回答済みの方：回答用キーで結果を開く</summary><label>回答用キー<input value={restore} onChange={e=>setRestore(e.target.value.trim())}/></label><button onClick={()=>{if(/^[a-f0-9]{64}$/.test(restore)){setToken(restore);setMessage('回答が見つからない場合はキーをご確認ください。');}else setMessage('64文字の回答用キーを入力してください。');}}>結果を開く</button></details></>:<>
      {event.state!=='published'?<><h2>回答を受け付けました</h2>{!closed&&<button className="meeting-secondary" onClick={()=>{setEditing(true);setStep(0);setConsent(false);}}>締切前に回答を修正する</button>}<p>締切後、出席確認ができた方の回答をもとに候補を調べます。運営の確認が終わると、この画面に結果が表示されます。</p>{!result.present&&<p>受付係に出席確認をお願いしてください。</p>}<p className="meeting-help">この画面は15秒ごとに更新されます。結果が出るまで例会をお楽しみください。</p></>:<><h2>本日の紹介候補</h2>{!result.matches.length&&<p>{!result.present?'出席確認ができなかったため、紹介候補はありません。受付係にお声がけください。':!answer.need?'今回は提供できる仕事を受け付けました。条件が合えば、相手の紹介候補に表示されます。':'今回は、回答内容から確かな候補が見つかりませんでした。無理な紹介は行っていません。受付係へのご相談も可能です。'}</p>}{result.matches.map(p=><article className="meeting-match" key={p.id}><small>{p.kind==='direct'?'仕事をお願いできる候補':'紹介を相談できる候補'}</small><h3>{p.name}さん</h3><p>{p.company} · {p.table||'席は受付係にご確認ください'}</p><p>{p.reason}</p><blockquote>「{p.offerQuote}」</blockquote>{!!p.questions.length&&<><b>まず確認したいこと</b><ul>{p.questions.map(q=><li key={q}>{q}</li>)}</ul></>}<p className="meeting-help">回答に基づく紹介候補です。受注・紹介の可否や条件は、ご本人とお確かめください。</p></article>)}</>}
      <button className="meeting-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(location.origin+location.pathname+'#receipt='+token);setMessage('結果を見る専用リンクをコピーしました。メモに保存し、他の方には渡さないでください。');}catch{setMessage('下の回答用キーを保存してください。');}}}>結果を見るリンクをコピー</button><details><summary>回答用キーを保存する</summary><p>この端末で結果を見られます。別の端末ではこのキーを使ってください。他の方には渡さないでください。</p><code className="meeting-token">{token}</code><button onClick={async()=>{try{await navigator.clipboard.writeText(token);setMessage('回答用キーをコピーしました。');}catch{setMessage('キーを長押ししてコピーしてください。');}}}>キーをコピー</button></details>
      {event.state==='published'&&<aside className="meeting-next"><h2>例会のあとも、仕事のご縁を。</h2><p>例会以外の時間もビジネスをつなげるために、TASUKIを活用してみませんか？ スマホから仕事を探したり、依頼や相談を続けられます。</p><a href="/login#start">TASUKIを使ってみる →</a><small>登録は任意です。アンケート結果の閲覧に登録は必要ありません。</small></aside>}
    </>}{message&&<p role="status" className="meeting-error">{message}</p>}
  </section></main>;
}
