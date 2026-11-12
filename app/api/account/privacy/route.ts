import { env } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSessionCookieToken, SESSION_COOKIE } from '@/app/app-auth';
import { ensureDatabase, getMobileSessionAccess, hashMobileSecret } from '@/db/data';
import { LINE_PRIVACY_COOKIE, allowLinePrivacySubmission, issueLinePrivacyGrant, readLinePrivacyGrant, removeLinePrivacyGrants, performLinePrivacyAction, verifyLinePrivacyCode, requestLinePrivacyCode, type PrivacyPurpose } from '@/db/line-privacy';
const headers = { 'Cache-Control':'no-store' };
export async function POST(request:Request) {
  if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'送信元を確認してください。'},{status:403,headers});
  try {
    await ensureDatabase();
    const raw=await request.text();if(raw.length>1200)throw new Error('入力を確認してください。');const body=JSON.parse(raw);
    if(!await allowLinePrivacySubmission(request.headers.get('cf-connecting-ip')||'local',body.action==='request'?'request':'confirm'))return NextResponse.json({error:'少し待って再試行してください。'},{status:429,headers});
    if(body.purpose!=='unlink'&&body.purpose!=='withdraw')throw new Error('操作を確認してください。');const purpose:PrivacyPurpose=body.purpose;
    const jar=await cookies(), priorToken=jar.get(LINE_PRIVACY_COOKIE)?.value||'';
    const prior=await readLinePrivacyGrant(priorToken,purpose);
    if(body.action==='cancel') { if(prior)await removeLinePrivacyGrants(prior.memberId,purpose);const response=NextResponse.json({canceled:true},{headers});setGrantCookie(response,'');return response; }
    if(purpose==='withdraw'&&env.ACCOUNT_ERASURE_ENABLED!=='true')throw new Error('オンライン退会は準備中です。運営窓口に退会・削除をご依頼ください。');
    const token=await getSessionCookieToken(), access=token?await getMobileSessionAccess(token,{skipLineAuthorization:true}):null;
    const email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
    const member=email?/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)&&email.length<=254?await env.DB.prepare('SELECT id,email,display_name FROM members WHERE lower(email)=? LIMIT 1').bind(email).first<{id:string;email:string;display_name:string}>():null:access?{id:access.user.userId,email:access.user.email,display_name:access.user.displayName}:null;
    if(body.action==='request'&&body.consent===true) {
      if(!access&&!email)throw new Error('登録メールアドレスを入力してください。');
      if(!env.RESEND_API_KEY||!env.AUTH_FROM_EMAIL)throw new Error('確認メールの送信設定が未完了です。');
      if(prior)await removeLinePrivacyGrants(prior.memberId,purpose);
      // 会員の有無やメール配送状態を匿名要求の返答から判別できないようにする。
      if(member)await requestLinePrivacyCode(member.id,purpose).catch(()=>undefined);
      const response=NextResponse.json({sent:true,message:'一致する会員登録があれば確認コードを送信しました。有効期限は10分です。'},{headers});setGrantCookie(response,'');return response;
    }
    let grant=prior, grantToken=priorToken;
    if(body.action==='confirm'&&body.confirm===true&&typeof body.code==='string') {
      if(!member)throw new Error('確認コードが正しくないか、有効期限・試行回数を超えています。');
      await verifyLinePrivacyCode(member.id,purpose,body.code);grantToken=await issueLinePrivacyGrant(member.id,purpose);grant=await readLinePrivacyGrant(grantToken,purpose);
    }else if(body.action!=='retry'||body.confirm!==true)throw new Error('操作を確認してください。');
    if(!grant)throw new Error('本人確認の期限が切れました。確認コードからやり直してください。');
    const owner=await env.DB.prepare('SELECT id,email,display_name FROM members WHERE id=?').bind(grant.memberId).first<{id:string;email:string;display_name:string}>();
    if(!owner)throw new Error('会員情報を確認できませんでした。');
    let result:Awaited<ReturnType<typeof performLinePrivacyAction>>;
    try { result=await performLinePrivacyAction({userId:owner.id,email:owner.email,displayName:owner.display_name,fullName:owner.display_name},purpose,{tokenHash:await hashMobileSecret(grantToken),purpose}); }
    catch(error) { const response=NextResponse.json({error:error instanceof Error?error.message:'完了できませんでした。'},{status:400,headers});setGrantCookie(response,grantToken);return response; }
    if(result.done)await removeLinePrivacyGrants(owner.id,purpose);
    const signedOut=Boolean(result.done)&&(purpose==='withdraw'||!token||!await getMobileSessionAccess(token,{skipLineAuthorization:true}));
    const response=NextResponse.json({...result,signedOut},{headers});setGrantCookie(response,result.done?'':grantToken);
    if(signedOut)response.cookies.set(SESSION_COOKIE,'',{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:0});return response;
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'操作を完了できませんでした。'},{status:400,headers});}
}
function setGrantCookie(response:NextResponse,value:string){response.cookies.set(LINE_PRIVACY_COOKIE,value,{httpOnly:true,secure:true,sameSite:'lax',path:'/',maxAge:value?600:0});}
