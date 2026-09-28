import {notFound} from 'next/navigation';
import {meeting} from '@/db/meetings';
import WishBoard from '../../WishBoard';
import '../../meeting.css';
export const dynamic='force-dynamic';
export const metadata={title:'参加者の希望｜TASUKI',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{code:string}>}) {
 const event=await meeting((await params).code);if(!event)notFound();return <WishBoard event={event}/>;
}
