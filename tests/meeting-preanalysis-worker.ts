import {env} from 'cloudflare:workers';
import {createMeeting,ensureMeetings,importRoster,meeting,attendees} from '../db/meetings';
import {dispatchPreanalysis,synchronizePreanalysis,processPreanalysis,preanalysisProgress} from '../db/meeting-preanalysis';
import {startMeetingAnalysis,processAnalysisJob} from '../db/meeting-analysis';
export default {async fetch(){try{
 const checks:string[]=[];function ok(value:unknown,label:string){if(!value)throw new Error(label);checks.push(label);}
 await ensureMeetings();
 const id=await createMeeting({title:'Preanalysis fixture',venue:'Fixture',closesAt:Date.now()+600000});
 const profiles=[{name:'Fixture A',company:'A',industry:'印刷',services:'チラシの印刷',area:'',table:''},{name:'Fixture B',company:'B',industry:'清掃',services:'オフィス清掃',area:'',table:''}];
 await importRoster(id,profiles,true);
 ok((await preanalysisProgress(id)).profiles.total===2,'roster import schedules business preparation');
 for(let i=0;i<2;i++)await env.DB.prepare('INSERT INTO meeting_answers(id,event_id,token_hash,answer,present,created_at) VALUES(?,?,?,?,1,?)').bind(id+':a'+i,id,id+':token'+i,JSON.stringify({...profiles[i],referrals:'',need:'相談できるIT会社',conditions:'',budget:'',timing:''}),Date.now()+i).run();
 await synchronizePreanalysis(id);
 ok((await preanalysisProgress(id)).needs.total===2,'received wishes schedule preparation');
 let prepCalls=0;const ai={async run(_model:string,input:{messages:{content:string}[]}){prepCalls++;const source=JSON.parse(input.messages[1].content);return {response:JSON.stringify(input.messages[0].content.startsWith('事前整理')?{topics:[{label:'分類',quote:source.industry||source.need}]}:{matches:[]})};}};
 async function prepareDocuments(eventId:string){const jobs=(await env.DB.prepare("SELECT id FROM meeting_preanalysis_jobs WHERE event_id=? AND kind!='warm' AND status!='complete'").bind(eventId).all<{id:string}>()).results;for(const j of jobs)ok(await processPreanalysis(j.id,ai)==='done','source document prepared');}
 async function prepareWarm(eventId:string,expected=2){await synchronizePreanalysis(eventId);await synchronizePreanalysis(eventId,Date.now()+61000);const jobs=(await env.DB.prepare("SELECT id FROM meeting_preanalysis_jobs WHERE event_id=? AND kind='warm'").bind(eventId).all<{id:string}>()).results;ok(jobs.length===expected,'quiet-period scheduling creates matching preparation');for(const j of jobs)ok(await processPreanalysis(j.id,ai)==='done','matching prepared');}
 await prepareDocuments(id);await prepareWarm(id);
 ok((await preanalysisProgress(id)).matching.completed===2,'preparation progress reports real completed matching work');
 ok((await meeting(id))?.state==='open'&&(await attendees(id)).every(p=>p.analyzed===0&&p.candidates.length===0),'preanalysis does not freeze answers or publish tentative candidates');
 const before=prepCalls;await prepareWarm(id);ok(prepCalls===before,'unchanged preparation is not analyzed again');
 // Changed wish invalidates only the affected result immediately, even during debounce.
 const edited={...profiles[0],referrals:'',need:'引越しできる業者',conditions:'',budget:'',timing:''};
 await env.DB.prepare('UPDATE meeting_answers SET answer=? WHERE id=?').bind(JSON.stringify(edited),id+':a0').run();await synchronizePreanalysis(id);
 ok((await preanalysisProgress(id)).needs.completed===1,'edited wish no longer appears prepared');
 ok((await preanalysisProgress(id)).matching.completed===1,'edited wish invalidates only its own matching progress');
 await prepareDocuments(id);await prepareWarm(id);
 // Existing inference keys are shared by preanalysis and final frozen-event analysis.
 await env.DB.prepare('UPDATE meeting_events SET closes_at=? WHERE id=?').bind(Date.now()-1000,id).run();
 await startMeetingAnalysis(id);let finalCalls=0;
 const noNewAI={async run(){finalCalls++;throw new Error('prepared inference should be reused');}};
 for(let i=0;i<2;i++)ok(await processAnalysisJob(id+':'+id+':a'+i,noNewAI)==='done','frozen matching resumes saved inference');
 ok(finalCalls===0&&(await meeting(id))?.state==='review','unchanged participant pool needs zero new AI calls after deadline');
 // Legacy attendance flags cannot change matching inputs or exclude an answer.
 const other=await createMeeting({title:'No-show fixture',venue:'Fixture',closesAt:Date.now()+600000});const extended=[...profiles,{name:'Fixture C',company:'C',industry:'建築',services:'内装工事',area:'',table:''}];await importRoster(other,extended,true);
 for(let i=0;i<3;i++)await env.DB.prepare('INSERT INTO meeting_answers(id,event_id,token_hash,answer,present,created_at) VALUES(?,?,?,?,1,?)').bind(other+':a'+i,other,other+':token'+i,JSON.stringify({...extended[i],referrals:'',need:'相談できるIT会社',conditions:'',budget:'',timing:''}),Date.now()+i).run();
 await synchronizePreanalysis(other);await prepareDocuments(other);await prepareWarm(other,3);
 await env.DB.prepare('UPDATE meeting_answers SET present=0 WHERE id=?').bind(other+':a1').run();await env.DB.prepare('UPDATE meeting_events SET closes_at=? WHERE id=?').bind(Date.now()-1000,other).run();await startMeetingAnalysis(other);
 let freshCalls=0;const fresh={async run(){freshCalls++;return {response:'{"matches":[]}'};}};
 for(let i=0;i<3;i++)await processAnalysisJob(other+':'+other+':a'+i,fresh);
 ok(freshCalls===0,'legacy attendance flags do not invalidate prepared matching');
 ok((await attendees(other)).find(p=>p.id===other+':a1')?.analyzed===1,'legacy unchecked respondents are analyzed');
 ok((await meeting(other))?.state==='review','all submitted answers complete without attendance checks');
 // No work may continue on a closed event or a stale edited version.
 const lateJobs=(await env.DB.prepare('SELECT id FROM meeting_preanalysis_jobs WHERE event_id=?').bind(other).all<{id:string}>()).results;
 const oldCalls=prepCalls;for(const j of lateJobs)await processPreanalysis(j.id,ai);ok(prepCalls===oldCalls,'closed-event preparation performs no AI calls');
 ok(await dispatchPreanalysis()===0,'scheduler does not queue closed events');
 return Response.json({pass:true,checks,preparationAICalls:prepCalls,finalAICalls:finalCalls,attendanceChangeAICalls:freshCalls});
 }catch(error){return Response.json({pass:false,error:String(error)},{status:500});}}};
