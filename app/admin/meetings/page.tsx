import { getAdmin } from '@/app/admin-auth';
import MeetingAdmin from './MeetingAdmin';
import '@/app/meeting/meeting.css';
export const dynamic = 'force-dynamic';
export default async function Page() {
  if (!await getAdmin()) return <main><h1>ログインしてください</h1><a href="/api/auth/google/start?return_to=%2Fadmin%2Fmeetings">運営アカウントでログイン</a></main>;
  return <MeetingAdmin />;
}
