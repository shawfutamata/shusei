import {NextResponse} from 'next/server';
import {getMeetingAccess} from '@/app/meeting/auth';
import {checkSubmissionLimit} from '@/db/meetings';
import {meetingNetwork} from '@/db/meeting-network';
export async function POST(request:Request,{params}:{params:Promise<{code:string}>}) {
 const headers={'Cache-Control':'no-store'};
 if(request.headers.get('origin')!==new URL(request.url).origin)return NextResponse.json({error:'送信元を確認してください。'},{status:403,headers});
 const access=await getMeetingAccess();if(!access)return NextResponse.json({error:'認証が必要です。'},{status:401,headers});
 try {const {code}=await params;if(!await checkSubmissionLimit(code,'network:'+access.user.userId))return NextResponse.json({error:'少し待って再試行してください。'},{status:429,headers});return NextResponse.json(await meetingNetwork(code,access.user.userId),{headers});}
 catch(e){return NextResponse.json({error:e instanceof Error?e.message:'候補を探せませんでした。'},{status:400,headers});}
}
