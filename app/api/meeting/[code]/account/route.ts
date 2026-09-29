import {NextResponse} from 'next/server';
import {SESSION_COOKIE} from '@/app/app-auth';
import {meeting,checkSubmissionLimit} from '@/db/meetings';
import {requestMeetingCode,verifyMeetingCode} from '@/db/meeting-accounts';
const headers={'Cache-Control':'no-store'};
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'送信元を確認してください。'},{status:403,headers});
 try {
  const {code}=await params;
  if(!await meeting(code))return NextResponse.json({error:'アンケートが見つかりません。'},{status:404,headers});
  if(!await checkSubmissionLimit(code,'account:'+ (request.headers.get('cf-connecting-ip')||'local')))return NextResponse.json({error:'少し待って再試行してください。'},{status:429,headers});
  const text=await request.text();if(text.length>2000)throw new Error('入力を確認してください。');
  const body=JSON.parse(text);
  if(typeof body.email!=='string'||body.consent!==true)throw new Error('入力を確認してください。');
  if(body.action==='request'){await requestMeetingCode(code,body.email);return NextResponse.json({ok:true},{headers});}
  if(body.action!=='verify'||typeof body.code!=='string')throw new Error('入力を確認してください。');
  const session=await verifyMeetingCode(code,body.email,body.code);
  const response=NextResponse.json({ok:true},{headers});
  response.cookies.set(SESSION_COOKIE,session.token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',expires:new Date(session.expiresAt)});
  return response;
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'登録できませんでした。'},{status:400,headers});}
}
