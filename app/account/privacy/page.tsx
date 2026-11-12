import {env} from 'cloudflare:workers';
import {cookies} from 'next/headers';
import {LINE_PRIVACY_COOKIE,readLinePrivacyGrant} from '@/db/line-privacy';
import {lineMessages} from '@/app/line-messages';
import PrivacyForm from './PrivacyForm';
export const dynamic='force-dynamic';
export const metadata={title:'LINE連携の解除・退会',robots:{index:false,follow:false}};
export default async function Page({searchParams}:{searchParams:Promise<{line?:string}>}){
  const query=await searchParams,token=(await cookies()).get(LINE_PRIVACY_COOKIE)?.value||'';
  const grant=await readLinePrivacyGrant(token);
  return <PrivacyForm initialMessage={lineMessages[query.line||'']||''} initialPending={Boolean(grant)} withdrawalReady={env.ACCOUNT_ERASURE_ENABLED==='true'}/>;
}
