import { NextResponse } from 'next/server';
import { meeting, ownResult, submitAnswer, checkSubmissionLimit, findRoster, rosterOptions, selectedRoster } from '@/db/meetings';
const noCache = {'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
export async function GET(request:Request,{params}:{params:Promise<{code:string}>}) {
  const {code}=await params;
  const token=request.headers.get('authorization')?.replace(/^Bearer /,'');
  if(token) {
    if(!/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({error:'回答用キーが違います。'},{status:401,headers:noCache});
    const result=await ownResult(code,token);
    return result ? NextResponse.json(result,{headers:noCache}) : NextResponse.json({error:'回答が見つかりません。'},{status:404,headers:noCache});
  }
  const event=await meeting(code);
  const query=new URL(request.url).searchParams;
  const name=query.get('name');
  if(event&&(query.has('people')||query.has('rosterId'))) {
    if(!await checkSubmissionLimit(code,request.headers.get('cf-connecting-ip')||'local','read'))return NextResponse.json({error:'アクセスが集中しています。少し待って再試行してください。'},{status:429,headers:noCache});
    if(query.has('rosterId')) {const person=await selectedRoster(code,query.get('rosterId')??'');return person?NextResponse.json({person},{headers:noCache}):NextResponse.json({error:'名簿の選択を確認してください。'},{status:404,headers:noCache});}
    return NextResponse.json({people:await rosterOptions(code)},{headers:noCache});
  }
  if(event&&name!==null){if(!await checkSubmissionLimit(code,request.headers.get('cf-connecting-ip')||'local','read'))return NextResponse.json({error:'検索が集中しています。少し待って再試行してください。'},{status:429,headers:noCache});return NextResponse.json({people:await findRoster(code,name)},{headers:noCache});}
  return event ? NextResponse.json({event},{headers:noCache}) : NextResponse.json({error:'アンケートが見つかりません。'},{status:404,headers:noCache});
}
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}) {
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'送信元を確認してください。'},{status:403});
  try {
    const code=(await params).code;
    if(!await meeting(code)) return NextResponse.json({error:'アンケートが見つかりません。'},{status:404,headers:noCache});
    if(!await checkSubmissionLimit(code,request.headers.get('cf-connecting-ip')||'local')) return NextResponse.json({error:'送信が集中しています。10分ほど待って再試行してください。'},{status:429,headers:noCache});
    const text=await request.text();
    if(text.length>10000) throw new Error('回答が長すぎます。');
    const body=JSON.parse(text) as Record<string,unknown>;
    await submitAnswer((await params).code,body);
    return NextResponse.json({ok:true},{headers:noCache});
  } catch(error) { return NextResponse.json({error:error instanceof Error?error.message:'送信できませんでした。'},{status:400,headers:noCache}); }
}
