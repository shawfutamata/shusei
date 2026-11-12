import { getAppAccess } from './app-auth';
import { lineTestOwnerSelected } from './line-test-config';

/** 既存の運営権限は広げず、確認済み本人の限定試験だけを許可する。 */
export async function getLineTestOwner() {
  const access = await getAppAccess();
  return access?.membership.canUseApp && lineTestOwnerSelected(access.user.userId) ? access.user : null;
}
