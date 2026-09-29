import {redirect} from 'next/navigation';
import {getMeetingAccess} from '@/app/meeting/auth';
import '@/app/meeting/meeting.css';
export const dynamic='force-dynamic';
export default async function Page(){const access=await getMeetingAccess();if(!access)redirect('/register');if(access.membership.canUseApp)redirect('/');return <main className="meeting-page meeting-survey meeting-signup"><header className="meeting-hiru-brand"><strong>TASUKI</strong></header><h1>登録ありがとうございます</h1><p>アカウントと会社情報を受け付けました。運営の確認が完了すると、同じアカウントでTASUKIを使えます。</p><a href="/login/member">ログインページへ →</a></main>;}
