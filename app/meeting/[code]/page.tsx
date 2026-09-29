import {meetingMemberProfile} from '@/db/meeting-accounts';
import MeetingSignup from '../MeetingSignup';
import {getMeetingAccess} from '@/app/meeting/auth';
import { notFound } from 'next/navigation';
import { meeting } from '@/db/meetings';
import MeetingForm from '../MeetingForm';
import '../meeting.css';
export const dynamic='force-dynamic';
export const metadata={title:'本日の仕事つながりアンケート',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{code:string}>}) {
  const event=await meeting((await params).code);
  if(!event) notFound();
  const access=await getMeetingAccess();const profile=access?await meetingMemberProfile(event.id,access.user.userId):null;
  return profile?<MeetingForm event={event} profile={profile}/> : <MeetingSignup event={event} signedIn={!!access}/>;
}
