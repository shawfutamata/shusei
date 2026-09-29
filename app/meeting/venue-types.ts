export const DEFAULT_MEETING_VENUE='hirunomeguro';
export const MAX_MEETING_PEOPLE=300;
export type MeetingVenue={id:string;name:string;website:string;legacySlug:string;startTime:string;enabled:boolean;createdAt:number};
export type MeetingOperator={email:string;venueId:string;createdAt:number};
export const MAX_MEETING_TABLES=60;
export function meetingTableLabel(index:number){let n=index+1,result='';while(n>0){n--;result=String.fromCharCode(65+n%26)+result;n=Math.floor(n/26);}return result;}
