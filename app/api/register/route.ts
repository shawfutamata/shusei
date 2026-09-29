import {NextResponse} from 'next/server';
import {SESSION_COOKIE} from '@/app/app-auth';
import {checkSubmissionLimit} from '@/db/meetings';
import {createSignupDraft,requestMeetingCode,verifyMeetingCode} from '@/db/meeting-accounts';
export async function POST(request:Request){const headers={'Cache-Control':'no-store'};
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'送信元を確認してください。'},{status:403,headers});
 try{if(!await checkSubmissionLimit('direct','account:'+(request.headers.get('cf-connecting-ip')||'local')))return NextResponse.json({error:'少し待って再試行してください。'},{status:429,headers});
 const text=await request.text();if(text.length>6000)throw new Error('入力を確認してください。');const body=JSON.parse(text);if(body.consent!==true)throw new Error('規約への同意をご確認ください。');
 if(body.action==='draft')return NextResponse.json({draft:await createSignupDraft('direct',{...body,walkIn:true,rosterId:''})},{headers});
 if(typeof body.email!=='string')throw new Error('メールアドレスを入力してください。');
 if(body.action==='request'){const draft=await createSignupDraft('direct',{...body,walkIn:true,rosterId:''});await requestMeetingCode('direct',body.email,draft);return NextResponse.json({ok:true},{headers});}
 if(body.action!=='verify'||typeof body.code!=='string')throw new Error('入力を確認してください。');const session=await verifyMeetingCode('direct',body.email,body.code),response=NextResponse.json({ok:true},{headers});response.cookies.set(SESSION_COOKIE,session.token,{httpOnly:true,secure:true,sameSite:'lax',path:'/',expires:new Date(session.expiresAt)});return response;
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'登録できませんでした。'},{status:400,headers});}}
