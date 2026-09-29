import { NextResponse } from 'next/server';
import {getMeetingAdmin,hasMeetingVenue} from '@/app/meeting-admin-auth';
import {DEFAULT_MEETING_VENUE} from '@/app/meeting/venue-types';
import { adminMeetingSummaries,listMeetings,meeting,attendees,createMeeting,meetingAnalysisProgress,removeCandidate,publishMeeting,roster,importRoster,setMeetingDeadline } from '@/db/meetings';
import {preanalysisProgress} from '@/db/meeting-preanalysis';
import {startMeetingAnalysis} from '@/db/meeting-analysis';
import { setQrTableCount,qrTableCount } from '@/db/meeting-automation';
import {updateMeeting,deleteMeeting,meetingTrash,trashedMeeting,restoreMeeting,emptyMeetingTrash} from '@/db/meeting-management';
const headers={'Cache-Control':'no-store'};
export async function GET(request:Request) {
  const admin=await getMeetingAdmin();if(!admin) return NextResponse.json({error:'権限がありません。'},{status:403,headers});
  const url=new URL(request.url),id=url.searchParams.get('id');
  if(url.searchParams.get('trash')==='1'){const venueId=url.searchParams.get('venue')||admin.venues[0]?.id||DEFAULT_MEETING_VENUE;if(!await hasMeetingVenue(admin,venueId))return NextResponse.json({error:'権限がありません。'},{status:403,headers});return NextResponse.json({trash:await meetingTrash(venueId)},{headers});}
  const venueId=new URL(request.url).searchParams.get('venue')||admin.venues[0]?.id||DEFAULT_MEETING_VENUE;
  const event=id?await meeting(id):null;
  if(!await hasMeetingVenue(admin,event?.venueId||venueId))return NextResponse.json({error:'権限がありません。'},{status:403,headers});
  if(id&&!event)return NextResponse.json({error:'例会が見つかりません。'},{status:404,headers});
  if(id&&url.searchParams.get('progress')==='1')return NextResponse.json({progress:await meetingAnalysisProgress(id),preanalysis:await preanalysisProgress(id)},{headers});
  return NextResponse.json(id?{event,attendees:await attendees(id),roster:await roster(id),qrTables:await qrTableCount(id),preanalysis:await preanalysisProgress(id)}:{events:await listMeetings(venueId),summaries:await adminMeetingSummaries(venueId)},{headers});
}
export async function POST(request:Request) {
  const admin=await getMeetingAdmin();if(!admin) return NextResponse.json({error:'権限がありません。'},{status:403,headers});
  if(request.headers.get('origin') && request.headers.get('origin')!==new URL(request.url).origin) return NextResponse.json({error:'送信元を確認してください。'},{status:403});
  try {
    const text=await request.text();
    if(text.length>500000)throw new Error('名簿のデータが大きすぎます。');
    const body=JSON.parse(text) as Record<string,unknown>;
    const venueId=typeof body.venueId==='string'?body.venueId:admin.venues[0]?.id||DEFAULT_MEETING_VENUE;
    if(body.action==='create'){if(!await hasMeetingVenue(admin,venueId))return NextResponse.json({error:'権限がありません。'},{status:403,headers});return NextResponse.json({id:await createMeeting(body,venueId)},{headers});}
    if(body.action==='empty-trash'){if(!await hasMeetingVenue(admin,venueId))return NextResponse.json({error:'権限がありません。'},{status:403,headers});return NextResponse.json({purged:await emptyMeetingTrash(venueId,body.confirmation)},{headers});}
    if(body.action==='restore'){const trashed=typeof body.id==='string'?await trashedMeeting(body.id):null;if(!trashed)throw new Error('ゴミ箱のイベントを選んでください。');if(!await hasMeetingVenue(admin,trashed.venueId))return NextResponse.json({error:'権限がありません。'},{status:403,headers});await restoreMeeting(trashed.id);return NextResponse.json({restored:true},{headers});}
    if(typeof body.id!=='string' || !await meeting(body.id)) throw new Error('例会を選んでください。');
    const event=await meeting(body.id);if(!await hasMeetingVenue(admin,event!.venueId||DEFAULT_MEETING_VENUE))return NextResponse.json({error:'権限がありません。'},{status:403,headers});
    switch(body.action) {
      case 'update': await updateMeeting(body.id,body);break;
      case 'delete': await deleteMeeting(body.id,body.confirmation);return NextResponse.json({deleted:true},{headers});
      case 'deadline': await setMeetingDeadline(body.id,body.closesAt);break;
      case 'qr-tables': await setQrTableCount(body.id,body.tables);break;
      case 'import': await importRoster(body.id,body.people,body.consent);break;
      case 'analyze': await startMeetingAnalysis(body.id); break;
      case 'remove':
        if(typeof body.personId!=='string' || typeof body.candidateId!=='string') throw new Error('候補を確認してください。');
        await removeCandidate(body.id,body.personId,body.candidateId); break;
      case 'publish': await publishMeeting(body.id); break;
      default: throw new Error('操作を確認してください。');
    }
    return NextResponse.json({event:await meeting(body.id),attendees:await attendees(body.id),roster:await roster(body.id),qrTables:await qrTableCount(body.id),preanalysis:await preanalysisProgress(body.id)},{headers});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'処理できませんでした。'},{status:400,headers});}
}
