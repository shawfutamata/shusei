import RegisterForm from './RegisterForm';
import '@/app/meeting/meeting.css';
export const dynamic='force-dynamic';
export const metadata={title:'アカウント登録 | TASUKI',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{invite?:string;login?:string}>}){const q=await searchParams;return <RegisterForm invite={q.invite||''} initialMessage={q.login !== undefined ? '認証できませんでした。入力内容を確認して、もう一度お進みください。' : ''}/>;}
