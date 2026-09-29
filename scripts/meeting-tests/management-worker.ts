import {managementTest} from './management';
export default {async fetch(){try{return Response.json(await managementTest());}catch(e){return Response.json({pass:false,error:String(e)},{status:500});}}};
