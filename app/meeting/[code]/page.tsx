import { notFound } from 'next/navigation';
import { meeting } from '@/db/meetings';
import MeetingForm from '../MeetingForm';
import '../meeting.css';
export const dynamic='force-dynamic';
export const metadata={title:'本日の仕事つながりアンケート｜ひるのめぐろ',robots:{index:false,follow:false},referrer:'no-referrer'};
export default async function Page({params}:{params:Promise<{code:string}>}) {
  const event=await meeting((await params).code);
  if(!event) notFound();
  return <MeetingForm event={event}/>;
}
