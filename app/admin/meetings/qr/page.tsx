import {getMeetingAdmin,hasMeetingVenue} from '@/app/meeting-admin-auth';
import {DEFAULT_MEETING_VENUE,meetingTableLabel} from '@/app/meeting/venue-types';
import { meeting } from '@/db/meetings';
import { qrTableCount } from '@/db/meeting-automation';
import QRCode from 'qrcode';
import PrintButton from './PrintButton';
import './print.css';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{id?:string;embedded?:string}>}){
 const admin=await getMeetingAdmin();if(!admin)return <main><a href="/login/member?return_to=%2Fadmin%2Fmeetings">運営アカウントでログイン</a></main>;
 const {id,embedded}=await searchParams;const event=id?await meeting(id):null;if(!event||!await hasMeetingVenue(admin,event.venueId||DEFAULT_MEETING_VENUE))return <main>例会を選んでください。</main>;
 const tables=await qrTableCount(event.id),url='https://tasuki.club/meeting/'+event.id;
 const svg=await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',margin:4,width:640,color:{dark:'#151918',light:'#ffffff'}});
 const src='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
 const pages=Math.ceil(tables/4);
 return <main className="meeting-print"><nav>{!embedded&&<a href={'/admin?tab=surveys&event='+encodeURIComponent(event.id)+'&view=edit'}>← ダッシュボードの例会管理</a>}<div><b>{tables}テーブル分 · A4に4枚ずつ</b><small>約96×140mm。切り取り線に沿ってカットしてください。</small></div><PrintButton/></nav>{!event.rosterCount&&<p className="qr-warning">名簿がまだ反映されていません。配布前に名簿の取り込みを完了してください。</p>}{Array.from({length:pages},(_,pageIndex)=><div className="qr-sheet" key={pageIndex}><div className="qr-grid">{Array.from({length:4},(_,slot)=>{const i=pageIndex*4+slot;return i<tables?<section className="qr-card" key={i}><header><strong>{event.venue}</strong><span>TABLE {meetingTableLabel(i)}</span></header><p className="qr-meeting-name">{event.title}</p><h2>今日、どんな人と<br/>つながりたいですか？</h2><p className="qr-instruction">お名前を選んで、希望をひとこと。</p><img width="640" height="640" src={src} alt="仕事つながりアンケートのQRコード"/><b>スマホで読み取って回答</b><p className="qr-deadline">回答締切 {new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})}<br/>無料登録で回答できます</p><footer>{url}</footer></section>:null;})}</div></div>)}</main>;
}
