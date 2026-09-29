import {getAppAccess} from './app-auth';
import {isAdminEmail} from './admin-emails';
import {listMeetingVenues,canManageMeetingVenue} from '@/db/meeting-venues';
export async function getMeetingAdmin(){const access=await getAppAccess();if(!access||['canceled','suspended'].includes(access.membership.status))return null;const platform=isAdminEmail(access.user.email);const venues=await listMeetingVenues(platform?undefined:access.user.email);if(!platform&&!venues.some(v=>v.enabled))return null;return {user:access.user,platform,venues:platform?venues:venues.filter(v=>v.enabled)};}
export async function hasMeetingVenue(admin:NonNullable<Awaited<ReturnType<typeof getMeetingAdmin>>>,venueId:string){return canManageMeetingVenue(admin.user.email,venueId,admin.platform);}
