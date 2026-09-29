import {getMeetingAccess} from '@/app/meeting/auth';
import {NextResponse} from 'next/server';
import {wishBoard,setWishSharing,checkSubmissionLimit} from '@/db/meetings';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}) {
  if(!await getMeetingAccess())return NextResponse.json({error:'Googleまたはメールで登録してアンケートへ進んでください。'},{status:401,headers:{'Cache-Control':'no-store'}});
  try {return NextResponse.json(await wishBoard((await params).code,request.headers.get('authorization')?.replace(/^Bearer /,'')||''),{headers});}
  catch(e){return NextResponse.json({error:e instanceof Error?e.message:'開けませんでした。'},{status:403,headers});}
}
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}) {
  if(!await getMeetingAccess())return NextResponse.json({error:'Googleまたはメールで登録してアンケートへ進んでください。'},{status:401,headers:{'Cache-Control':'no-store'}});
  if(request.headers.get('origin')&&request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'送信元を確認してください。'},{status:403,headers});
  try {
    const {code}=await params;
    if(!await checkSubmissionLimit(code,request.headers.get('cf-connecting-ip')||'local'))return NextResponse.json({error:'少し待って再試行してください。'},{status:429,headers});
    const text=await request.text();if(text.length>1000)throw new Error('設定を確認してください。');
    const body=JSON.parse(text) as {shared:boolean};
    await setWishSharing(code,request.headers.get('authorization')?.replace(/^Bearer /,'')||'',body.shared);
    return NextResponse.json({ok:true},{headers});
  }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'保存できませんでした。'},{status:400,headers});}
}
