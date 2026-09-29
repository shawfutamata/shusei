import {env} from 'cloudflare:workers';
import {createMeeting,ensureMeetings,meeting,meetingAnalysisProgress} from '../db/meetings';
import {startMeetingAnalysis,processAnalysisJob,dispatchAnalysisJobs} from '../db/meeting-analysis';
export default {async fetch(){
 const checks:string[]=[];function ok(value:unknown,label:string){if(!value)throw new Error(label);checks.push(label);}
 await ensureMeetings();
 const id=await createMeeting({title:'Background fixture',venue:'Fixture',closesAt:Date.now()+60000});
 await env.DB.prepare('UPDATE meeting_events SET closes_at=? WHERE id=?').bind(Date.now()-1000,id).run();
 const answer={name:'Fixture',company:'Fixture',table:'',industry:'印刷',services:'チラシの印刷',referrals:'',need:'相談できるIT業者',area:'',timing:'',budget:'',conditions:''};
 for(let i=0;i<3;i++)await env.DB.prepare('INSERT INTO meeting_answers(id,event_id,token_hash,answer,present,created_at) VALUES(?,?,?,?,?,?)').bind('a'+i,id,'token'+i,JSON.stringify(answer),i===2?0:1,Date.now()).run();
 await startMeetingAnalysis(id);
 ok((await meeting(id))?.state==='analyzing','answers frozen before background analysis');
 ok((await meetingAnalysisProgress(id)).queued===2,'confirmed participants enqueued only');
 await startMeetingAnalysis(id);
 ok((await env.DB.prepare('SELECT COUNT(*) AS n FROM meeting_analysis_jobs').first<{n:number}>())?.n===2,'repeated start does not duplicate jobs');
 let calls=0;const ai={async run(){calls++;return {response:'{"matches":[]}'};}};
 const first=await processAnalysisJob(id+':a0',{async run(){throw new Error('transient');}});
 ok(first==='retry'&&(await meetingAnalysisProgress(id)).completed===0,'transient error is retried without saving false empty result');
 ok((await meetingAnalysisProgress(id)).retrying===1,'retry status is visible');
 ok(await processAnalysisJob(id+':a1',ai)==='done','other participant continues despite failed peer');
 ok((await meetingAnalysisProgress(id)).completed===1&&(await meeting(id))?.state==='analyzing','event is not complete while one answer is pending');
 ok(await processAnalysisJob(id+':a0',ai)==='done','failed participant succeeds on later delivery');
 ok((await meeting(id))?.state==='review'&&(await meetingAnalysisProgress(id)).completed===2,'last successful delivery moves event to review');
 const previousCalls=calls;await processAnalysisJob(id+':a0',ai);ok(calls===previousCalls,'duplicate delivery does not reanalyze completed answer');
 // Exhaustion never blocks analysis of other people or publishes fabricated results.
 await env.DB.prepare("UPDATE meeting_events SET state='analyzing' WHERE id=?").bind(id).run();
 await env.DB.prepare("UPDATE meeting_answers SET analyzed=0 WHERE id='a0'").run();
 await env.DB.prepare("UPDATE meeting_analysis_jobs SET status='queued',attempts=5,lease_until=0 WHERE answer_id='a0'").run();
 await processAnalysisJob(id+':a0',{async run(){throw new Error('persistent');}});
 ok((await meetingAnalysisProgress(id)).failed===1&&(await meetingAnalysisProgress(id)).completed===1,'exhausted answer is flagged, not falsely completed');
 await startMeetingAnalysis(id);ok((await meetingAnalysisProgress(id)).failed===0,'explicit retry resets exhausted answer only');
 // A worker interruption retains its cached work and expires its exclusive lease.
 await env.DB.prepare("UPDATE meeting_analysis_jobs SET status='processing',lease_until=?,attempts=1 WHERE answer_id='a0'").bind(Date.now()-1000).run();
 await env.DB.prepare("INSERT INTO meeting_analysis_cache VALUES(?, 'saved-step', '{}')").bind(id+':a0').run();
 await dispatchAnalysisJobs();ok((await meetingAnalysisProgress(id)).queued===1,'expired worker lease is recovered without browser');
 ok((await env.DB.prepare('SELECT COUNT(*) AS n FROM meeting_analysis_cache').first<{n:number}>())?.n===1,'recovery preserves completed inference cache');
 await processAnalysisJob(id+':a0',ai);ok((await meeting(id))?.state==='review','recovery can complete event');
 ok((await env.DB.prepare('SELECT COUNT(*) AS n FROM meeting_analysis_cache').first<{n:number}>())?.n===0,'completed job cache is cleaned');
 return Response.json({pass:true,checks});
}};
