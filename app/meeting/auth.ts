import {getSessionCookieToken} from '@/app/app-auth';
import {getMobileSessionAccess} from '@/db/data';
// The Authorization header on survey routes is a separate answer receipt, not a login token.
export async function getMeetingAccess() {
 const token=await getSessionCookieToken();
 const access=token?await getMobileSessionAccess(token):null;
 return access&&(access.membership.canUseApp||access.membership.status==='invited')?access:null;
}
