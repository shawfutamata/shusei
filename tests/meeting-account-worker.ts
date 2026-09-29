import {requestMeetingCode,verifyMeetingCode,startMeetingAccount} from '../db/meeting-accounts';
import {getMobileSessionAccess} from '../db/data';
export default {async fetch(request:Request) {
 const body=await request.json() as {action:string;event:string;email:string;code:string;token:string};
 try {
  const result=body.action==='request'?await requestMeetingCode(body.event,body.email):body.action==='verify'?await verifyMeetingCode(body.event,body.email,body.code):body.action==='google'?await startMeetingAccount(body.email,'Google Name'):await getMobileSessionAccess(body.token);
  return Response.json(result||{ok:true});
 }catch(error){return Response.json({error:error instanceof Error?error.message:'error'},{status:400});}
}};
