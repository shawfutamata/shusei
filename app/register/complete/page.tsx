import {redirect} from 'next/navigation';
import {getMeetingAccess} from '@/app/meeting/auth';
import '@/app/meeting/meeting.css';
export const dynamic='force-dynamic';
export default async function Page(){const access=await getMeetingAccess();if(!access)redirect('/register');if(access.membership.canUseApp)redirect('/');return <main className="meeting-page meeting-survey meeting-signup"><header className="meeting-hiru-brand"><strong>TASUKI</strong></header><h1>アカウント登録を受け付けました</h1><h2>現在、運営確認待ちです</h2><p>アカウントと会社情報を受け付けました。運営の確認が完了すると、同じアカウントでTASUKIを使えます。</p><a href="/login/member">確認完了後のログインはこちら →</a></main>;}
