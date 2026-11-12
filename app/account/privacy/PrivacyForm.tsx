'use client';
import { useEffect, useRef, useState } from 'react';
import { requestLineAuthorization } from '@/app/line-authorization-client';
import { serviceName } from '@/app/brand';
import '@/app/line.css';
export default function PrivacyForm({initialMessage='',initialPending=false,withdrawalReady=false}:{initialMessage?:string;initialPending?:boolean;withdrawalReady?:boolean}) {
  const [email,setEmail]=useState(''),[code,setCode]=useState(''),[purpose,setPurpose]=useState<'unlink'|'withdraw'>('unlink'),[sent,setSent]=useState(false),[pending,setPending]=useState(initialPending),[recover,setRecover]=useState(initialPending),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(initialMessage);
  const feedback=useRef<HTMLParagraphElement>(null),submitting=useRef(false),operation=useRef(0);
  const oauth=useRef<AbortController|null>(null);
  const [startingOAuth,setStartingOAuth]=useState(false);
  // 画面を離れた後の応答で、新しい画面へ戻したり完了表示したりしない。
  useEffect(()=>()=>{operation.current++;oauth.current?.abort();submitting.current=false;},[]);
  useEffect(()=>{if(error||message)feedback.current?.focus();},[error,message]);
  async function act(action:'request'|'confirm'|'retry'|'cancel') {
    if(action==='cancel'&&oauth.current){operation.current++;oauth.current.abort();oauth.current=null;setStartingOAuth(false);submitting.current=false;}
    if(submitting.current)return;submitting.current=true;const current=++operation.current;setBusy(true);setError('');setMessage('');
    try{
      const response=await fetch('/api/account/privacy',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action,purpose,email,code,consent:true,confirm:action==='confirm'||action==='retry'})});
      const data=await response.json() as {error?:string;sent?:boolean;canceled?:boolean;done?:boolean;pending?:boolean;needsLineConfirmation?:boolean;message?:string};if(current!==operation.current)return;if(!response.ok)throw new Error(data.error||'手続きを完了できませんでした。');
      if(action==='cancel'){if(data.canceled!==true)throw new Error('キャンセルを確認できませんでした。もう一度お試しください。');setSent(false);setPending(false);setRecover(false);setCode('');setMessage(pending?'本人確認の手続きを終了しました。通知停止や、既にLINEへ送信した解除処理は取り消されません。':'本人確認をキャンセルしました。');}
      else if(action==='request'){if(data.sent!==true)throw new Error('確認コードの送信依頼を確認できませんでした。もう一度お試しください。');setSent(true);setPending(false);setRecover(false);setMessage(data.message||'一致する登録があれば確認コードを送信しました。');}
      else if(data.pending===true){setPending(true);setRecover(data.needsLineConfirmation===true);setMessage(data.message||'解除はまだ完了していません。');}
      else if(data.done===true)window.location.assign(`/login/member?login=${purpose==='unlink'?'line_removed':'account_removed'}`);
      else throw new Error('手続きの完了を確認できませんでした。もう一度お試しください。');
    }catch(cause){if(current===operation.current)setError(cause instanceof Error?cause.message:'通信できませんでした。');}finally{if(current===operation.current){submitting.current=false;setBusy(false);}}
  }
  async function recoverLine() {
    if(submitting.current)return;submitting.current=true;const current=++operation.current,controller=new AbortController();oauth.current=controller;
    setStartingOAuth(true);setBusy(true);setError('');setMessage('LINEの本人確認画面を開いています…');let navigating=false;
    try{
      const url=await requestLineAuthorization({action:'unlink_recovery'},controller);
      if(current!==operation.current||controller.signal.aborted)return;
      window.location.assign(url);navigating=true;oauth.current=null;setStartingOAuth(false);
    }catch{if(current===operation.current){setMessage('');setError('LINEの本人確認画面を開けませんでした。解除の完了は確認できていません。画面を再読み込みして状態をご確認ください。');}}
    finally{if(current===operation.current&&!navigating){oauth.current=null;setStartingOAuth(false);submitting.current=false;setBusy(false);}}
  }
  return <main className="line-settings-page"><a href="/login/member">← ログイン画面へ戻る</a><h1>LINE連携の解除・退会</h1><p>{serviceName}に登録したメールアドレスで本人確認します。LINEでログインできない場合も、この画面から確認できます。</p>
    <section><h2>手続きの内容</h2><p>LINE連携を解除すると通知が停止し、LINE側の{serviceName}との連動も解除します。会員登録・投稿・ご自身で入力した名前やメールは残ります。再ログインには、登録メールと同じGoogleアカウントが必要です。ご用意できない場合は、先に運営窓口へご相談ください。</p>
      {withdrawalReady?<label>手続き<select disabled={busy||sent||pending} value={purpose} onChange={e=>setPurpose(e.target.value as 'unlink'|'withdraw')}><option value="unlink">LINE連携を解除</option><option value="withdraw">TASUKIを退会</option></select></label>:<p>オンライン退会は準備中です。退会・削除は運営窓口へご依頼ください。</p>}
      {purpose==='withdraw'&&<p>退会は元に戻せません。先にLINE連携を解除してください。取引・請求・共有記録がある場合、この画面では削除せず運営で確認します。</p>}
      {!pending&&<form onSubmit={e=>{e.preventDefault();void act('request');}}><label className="line-privacy-code">登録メールアドレス<input type="email" autoComplete="email" required maxLength={254} value={email} onChange={e=>setEmail(e.target.value)} disabled={busy||sent}/></label><p>この操作の確認コードを、登録メールアドレスへ送ることを依頼します。</p><button className="line-unlink" disabled={busy}>{sent?'確認コードを再送':'確認コードを送る'}</button></form>}
      {(error||message)&&<p ref={feedback} tabIndex={-1} role={error?'alert':'status'} className={`line-feedback ${error?'line-error':'line-status'}`}>{error||message}</p>}
      {sent&&!pending&&<form onSubmit={e=>{e.preventDefault();void act('confirm');}}><label className="line-privacy-code">6桁の確認コード<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e=>setCode(e.target.value)} disabled={busy}/></label><button className="line-unlink" disabled={busy||!/^\d{6}$/.test(code)}>{purpose==='unlink'?'本人確認してLINE連携を解除':'本人確認して退会する'}</button></form>}
      {pending&&<><button className="line-unlink" disabled={busy} onClick={()=>void act('retry')}>解除の処理を再試行</button>{recover&&<form action="/api/auth/line/start" method="post" onSubmit={e=>{e.preventDefault();void recoverLine();}}><input type="hidden" name="action" value="unlink_recovery"/><input type="hidden" name="consent" value="yes"/><p>同じLINEで本人確認し、{serviceName}との連動解除を完了します。</p><button type="button" onClick={()=>void recoverLine()} className="line-button" disabled={busy}>LINEで本人確認して解除を完了</button></form>}<p>LINEで本人確認できない場合や、再試行しても完了しない場合は運営窓口での確認が必要です。確認が取れるまで解除完了とは表示しません。</p></>}
      {(sent||pending)&&<button className="line-unlink" disabled={busy&&!startingOAuth} onClick={()=>void act('cancel')}>キャンセルして入力し直す</button>}
    </section>
  </main>;
}
