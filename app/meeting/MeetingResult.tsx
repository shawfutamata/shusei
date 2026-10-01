import MeetingNetwork from './MeetingNetwork';
import {splitIndustryLabels} from '../industry-options';
import {deadlineCountdown} from './deadline-countdown';
import type {Answer,Candidate,Meeting} from './types';
type Result={answer:Answer;rosterId:string;walkIn?:boolean;shareWish:boolean;present:number;analyzed:number;matches:(Candidate & {name:string;company:string;table:string;industry:string})[]};
type IconName='person'|'people'|'search'|'arrow'|'copy'|'check'|'clock';
function Icon({name,className=''}:{name:IconName;className?:string}) {
 const paths:Record<IconName,React.ReactNode>={
  person:<><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></>,
  people:<><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6m2 3a5 5 0 0 1 3 5v1"/></>,
  search:<><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/></>,
  arrow:<path d="M4 12h16m-6-6 6 6-6 6"/>,
  copy:<><rect x="8" y="8" width="12" height="13" rx="2"/><path d="M15 8V3H3v12h5"/></>,
  check:<><circle cx="12" cy="12" r="9"/><path d="m7 12 3 3 7-7"/></>,
  clock:<><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>
 };
 return <svg className={`meeting-ui-icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}
export default function MeetingResult({event,result,token,busy,closed,now,onShare,onEdit,onMessage}:{event:Meeting;result:Result;token:string;busy:boolean;closed:boolean;now:number;onShare:(shared:boolean)=>Promise<void>;onEdit:()=>void;onMessage:(message:string)=>void}) {
 const published=event.state==='published';
 const available=published&&result.analyzed===1;
 const countdown=deadlineCountdown(event.closesAt,now,closed);
 const deadline=new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
 return <>
  <div className="meeting-result-heading"><div><p className="meeting-result-venue">{event.venue}{event.title!==event.venue&&` · ${event.title}`}</p><h1>{available?'本日のマッチング結果':'回答ありがとうございます'}</h1><p className="meeting-result-subtitle">今日の出会いを、仕事につなげる。</p></div><span className={`meeting-result-state${available?' is-published':''}`}><Icon name={available?'check':'clock'}/>{published&&!available?'分析中':available?'結果公開済み':'結果を準備中'}</span></div>
  <div className="meeting-result-layout">
   <aside className="meeting-result-profile">
    <div className="meeting-result-person"><span className="meeting-person-symbol"><Icon name="person"/></span><div><strong>{result.answer.name}さん</strong><p>{result.answer.company}</p></div></div>
    <section className="meeting-result-wish" aria-labelledby="meeting-own-request-title"><h2 id="meeting-own-request-title">あなたの希望</h2><p>{result.answer.need||'つながりたい相手の希望は未入力です。'}</p></section>
    {!closed&&(!!result.rosterId||!!result.walkIn)&&<div className="meeting-wish-edit"><button className="meeting-secondary" onClick={onEdit}>希望を編集する</button><p>締切までは何度でも変更できます。</p><small>締切：{new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</small></div>}
    {!!result.answer.need.trim()&&<div className="meeting-sharing"><label className="meeting-consent"><input type="checkbox" disabled={busy} checked={result.shareWish} onChange={e=>void onShare(e.target.checked)}/><span><strong>参加者に希望を掲載する<span className="meeting-optional">任意</span></strong><small>名前・会社名・希望を同じ例会の参加者に表示。あとから取り消せます。</small></span></label></div>}
   </aside>
   <div className="meeting-result-main">
    <section className="meeting-result-candidates" aria-labelledby="meeting-candidates-title"><div className="meeting-result-section-heading"><h2 id="meeting-candidates-title">{published&&!available?'分析中':published?'本日の紹介候補':'紹介候補を確認しています'}</h2>{available&&<span>{result.matches.length}人</span>}</div>
     {!published?<div className="meeting-result-empty"><div className={`meeting-deadline${closed?' is-closed':''}`}><div className="meeting-deadline-time"><Icon name="clock"/><span>回答締切 <time dateTime={new Date(event.closesAt).toISOString()}>{deadline}</time><small>日本時間</small></span></div><div className="meeting-countdown" role="timer" aria-live="off"><span>{closed?'回答の受付は終了しました':'締切まであと'}</span><strong>{countdown}</strong></div></div><h3>結果が出るまで、例会をお楽しみください</h3><p>締切後、運営が紹介候補を確認して公開します。</p><small>15秒ごとに自動で更新します。</small></div>:!available?<div className="meeting-result-empty"><span className="meeting-empty-symbol"><Icon name="clock"/></span><h3>あなたの紹介候補を分析しています</h3><p>分析が完了すると、この画面に結果が表示されます。</p><small>15秒ごとに自動で更新します。</small></div>:!result.matches.length?<div className="meeting-result-empty"><span className="meeting-empty-symbol"><Icon name="search"/></span><h3>{!result.answer.need?'今回は、できる仕事を受け付けました':'今回は確かな候補が見つかりませんでした'}</h3><p>{!result.answer.need?'条件が合えば、相手の紹介候補に表示されます。':'無理な紹介は行いません。参加者の希望から、ご縁が見つかることもあります。'}</p></div>:<div className="meeting-result-match-list">{result.matches.map((p,index)=><article className={`meeting-result-match${p.kind==='related'?' is-related':''}`} key={p.id}>
      <div className="meeting-match-person"><span className="meeting-match-number">{String(index+1).padStart(2,'0')}</span><div><small>{p.kind==='related'?'関連する仕事の候補':p.kind==='direct'?'つながりの候補':'紹介を相談できる候補'}</small><h3>{p.name}さん</h3><p>{p.company}{p.table&&` · ${p.table}`}</p>{p.industry&&<div className="meeting-match-industries">{splitIndustryLabels(p.industry).map(industry=><span key={industry}>{industry}</span>)}</div>}</div></div><blockquote><small>相談できる仕事</small>{p.offerQuote}</blockquote><details className="meeting-match-questions"><summary>紹介の理由・確認したいこと</summary><p className="meeting-match-reason">{p.reason}</p>{!!p.questions.length&&<ul>{p.questions.map(q=><li key={q}>{q}</li>)}</ul>}<p className="meeting-help">受注・紹介の可否や条件は、ご本人とお確かめください。</p></details>
     </article>)}</div>}
    </section>
    {available&&<nav className="meeting-participant-link" aria-label="参加者の希望"><a href={`/meeting/${event.id}/requests`}>参加者の希望を見る<Icon name="arrow"/></a></nav>}
   </div>
  </div>
  {available&&<MeetingNetwork eventId={event.id} need={result.answer.need}/>}

 </>;
}
