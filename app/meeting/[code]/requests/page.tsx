import {meetingMemberProfile} from '@/db/meeting-accounts';
import MeetingSignup from '../../MeetingSignup';
import {getMeetingAccess} from '@/app/meeting/auth';
import {notFound} from 'next/navigation';
import {meeting} from '@/db/meetings';
import WishBoard from '../../WishBoard';
import '../../meeting.css';
export const dynamic='force-dynamic';
export const metadata={title:'参加者の希望',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{code:string}>}) {
 const event=await meeting((await params).code);if(!event)notFound();const access=await getMeetingAccess();const profile=access?await meetingMemberProfile(event.id,access.user.userId):null;return profile?<WishBoard event={event}/> : <MeetingSignup event={event} requests signedIn={!!access}/>;
}
