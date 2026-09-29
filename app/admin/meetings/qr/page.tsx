import { getAdmin } from '@/app/admin-auth';
import { meeting } from '@/db/meetings';
import { qrTableCount } from '@/db/meeting-automation';
import QRCode from 'qrcode';
import PrintButton from './PrintButton';
import './print.css';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<{id?:string}>}){
 if(!await getAdmin())return <main><a href="/login/member?return_to=%2Fadmin%2Fmeetings">運営アカウントでログイン</a></main>;
 const {id}=await searchParams;const event=id?await meeting(id):null;if(!event)return <main>例会を選んでください。</main>;
 const tables=await qrTableCount(event.id),url='https://tasuki.club/meeting/'+event.id;
 const svg=await QRCode.toString(url,{type:'svg',errorCorrectionLevel:'M',margin:4,width:640,color:{dark:'#151918',light:'#ffffff'}});
 const src='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');
 return <main className="meeting-print"><nav><a href={'/admin/meetings?event='+encodeURIComponent(event.id)}>← 例会管理</a><b>{tables}テーブル分 · A4・1テーブル1枚</b><PrintButton/></nav>{!event.rosterCount&&<p className="qr-warning">名簿がまだ反映されていません。配布前に名簿の取り込みを完了してください。</p>}{Array.from({length:tables},(_,i)=><section className="qr-sheet" key={i}><header><strong>ひるのめぐろ</strong><span>TABLE {String.fromCharCode(65+i)}</span></header><p className="qr-meeting-name">{event.title}</p><h1>今日、どんな人と<br/>つながりたいですか？</h1><p>お名前を選んで、希望をひとこと。</p><img width="640" height="640" src={src} alt="仕事つながりアンケートのQRコード"/><b>スマホで読み取って回答</b><p className="qr-deadline">回答締切 {new Date(event.closesAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} · ログイン不要</p><footer>{url}</footer></section>)}</main>;
}
