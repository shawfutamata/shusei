import {getMeetingAccess} from '@/app/meeting/auth';
import {NextResponse} from 'next/server';
import {SESSION_COOKIE} from '@/app/app-auth';
import {meeting,checkSubmissionLimit,rosterOptions,selectedRoster} from '@/db/meetings';
import {requestMeetingCode,verifyMeetingCode,createSignupDraft,saveMeetingProfile} from '@/db/meeting-accounts';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}) {
 const {code}=await params;
 if(!await meeting(code))return NextResponse.json({error:'アンケートが見つかりません。'},{status:404,headers});
 if(!await checkSubmissionLimit(code,'signup:'+ (request.headers.get('cf-connecting-ip')||'local'),'read'))return NextResponse.json({error:'少し待って再試行してください。'},{status:429,headers});
 const query=new URL(request.url).searchParams;
 if(query.has('rosterId')){const person=await selectedRoster(code,query.get('rosterId')||'',true);return person?NextResponse.json({person:{...person,table:''}},{headers}):NextResponse.json({error:'会社・お名前を選び直してください。'},{status:404,headers});}
 return NextResponse.json({people:await rosterOptions(code,true)},{headers});
}
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}) {
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'送信元を確認してください。'},{status:403,headers});
 try {
  const {code}=await params;
  if(!await meeting(code))return NextResponse.json({error:'アンケートが見つかりません。'},{status:404,headers});
  if(!await checkSubmissionLimit(code,'account:'+ (request.headers.get('cf-connecting-ip')||'local')))return NextResponse.json({error:'少し待って再試行してください。'},{status:429,headers});
  const text=await request.text();if(text.length>6000)throw new Error('入力を確認してください。');
  const body=JSON.parse(text);
  if(body.consent!==true)throw new Error('入力を確認してください。');
  if(body.action==='profile'){const access=await getMeetingAccess();if(!access)return NextResponse.json({error:'先に認証してください。'},{status:401,headers});await saveMeetingProfile(code,access.user.userId,body,true);return NextResponse.json({ok:true},{headers});}
  if(body.action==='draft')return NextResponse.json({draft:await createSignupDraft(code,body)},{headers});
  if(typeof body.email!=='string')throw new Error('メールアドレスを入力してください。');
  if(body.action==='request'){const draft=await createSignupDraft(code,body);await requestMeetingCode(code,body.email,draft);return NextResponse.json({ok:true},{headers});}
  if(body.action!=='verify'||typeof body.code!=='string')throw new Error('入力を確認してください。');
  const session=await verifyMeetingCode(code,body.email,body.code);
  const response=NextResponse.json({ok:true},{headers});
  response.cookies.set(SESSION_COOKIE,session.token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',expires:new Date(session.expiresAt)});
  return response;
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'登録できませんでした。'},{status:400,headers});}
}
