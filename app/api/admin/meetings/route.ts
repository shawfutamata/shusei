import { NextResponse } from 'next/server';
import { getAdmin } from '@/app/admin-auth';
import { listMeetings,meeting,attendees,createMeeting,confirmAttendance,analyzeNext,removeCandidate,publishMeeting,roster,importRoster } from '@/db/meetings';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request) {
  if(!await getAdmin()) return NextResponse.json({error:'権限がありません。'},{status:403,headers});
  const id=new URL(request.url).searchParams.get('id');
  return NextResponse.json(id?{event:await meeting(id),attendees:await attendees(id),roster:await roster(id)}:{events:await listMeetings()},{headers});
}
export async function POST(request:Request) {
  if(!await getAdmin()) return NextResponse.json({error:'権限がありません。'},{status:403,headers});
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'送信元を確認してください。'},{status:403});
  try {
    const text=await request.text();
    if(text.length>200000)throw new Error('名簿のデータが大きすぎます。');
    const body=JSON.parse(text) as Record<string,unknown>;
    if(body.action==='create') return NextResponse.json({id:await createMeeting(body)},{headers});
    if(typeof body.id!=='string' || !await meeting(body.id)) throw new Error('例会を選んでください。');
    switch(body.action) {
      case 'import': await importRoster(body.id,body.people,body.consent);break;
      case 'attendance':
        if(typeof body.personId!=='string' || typeof body.present!=='boolean') throw new Error('出席者を確認してください。');
        await confirmAttendance(body.id,body.personId,body.present); break;
      case 'analyze': await analyzeNext(body.id); break;
      case 'remove':
        if(typeof body.personId!=='string' || typeof body.candidateId!=='string') throw new Error('候補を確認してください。');
        await removeCandidate(body.id,body.personId,body.candidateId); break;
      case 'publish': await publishMeeting(body.id); break;
      default: throw new Error('操作を確認してください。');
    }
    return NextResponse.json({event:await meeting(body.id),attendees:await attendees(body.id),roster:await roster(body.id)},{headers});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'処理できませんでした。'},{status:400,headers});}
}
