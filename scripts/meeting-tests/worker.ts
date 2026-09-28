import {wishesTest} from './wishes';
import {guestTest} from './guests';
import { rosterTest } from './roster';
import { storageTest, pipelineTest } from './storage';
import { matchAttendee, type AIClient } from '../../app/meeting/matching';
import { fixtures } from './fixtures';
const worker={async fetch(request:Request,env:{MEETING_AI:AIClient}) {
 if(new URL(request.url).pathname==='/wishes')return Response.json(await wishesTest());
 if(new URL(request.url).pathname==='/guests')return Response.json(await guestTest());
 if(new URL(request.url).pathname==='/roster')return Response.json(await rosterTest());
 if(new URL(request.url).pathname==='/pipeline')return Response.json(await pipelineTest());
 if(new URL(request.url).pathname==='/storage')return Response.json(await storageTest());
 const index=Number(new URL(request.url).searchParams.get('case')||0);const test=fixtures[index];
 if(!test)return Response.json({error:'case not found'},{status:404});
 try{const matches=await matchAttendee(env.MEETING_AI,test.seeker,[test.seeker,...test.people]);return Response.json({case:test.name,expected:test.expected,actual:matches.map(m=>m.id),pass:JSON.stringify(matches.map(m=>m.id).sort())===JSON.stringify([...test.expected].sort()),matches});}
 catch(e){return Response.json({error:String(e)},{status:500});}
}};

export default worker;
