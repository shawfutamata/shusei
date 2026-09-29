import {env} from 'cloudflare:workers';
import {attendees,ensureMeetings,meeting} from './meetings';
import {matchAttendee,type AIClient} from '@/app/meeting/matching';
const LEASE_MS=16*60000,MAX_ATTEMPTS=6;
type Job={id:string;event_id:string;answer_id:string;status:string;attempts:number;lease_until:number};
async function finishEvent(id:string){
 await env.DB.prepare(`UPDATE meeting_events SET state='review',lock_until=0,lock_id='' WHERE id=? AND state='analyzing'
 AND NOT EXISTS(SELECT 1 FROM meeting_answers WHERE event_id=? AND present=1 AND analyzed=0)`).bind(id,id).run();
}
// Queue messages contain only a job ID; answers are read from the scoped, frozen event.
export async function dispatchAnalysisJobs(){
 await ensureMeetings();const now=Date.now();
 await env.DB.prepare(`UPDATE meeting_analysis_jobs SET status='pending',lease_id='',lease_until=0,dispatch_at=0
 WHERE status='processing' AND lease_until<? AND attempts<?`).bind(now,MAX_ATTEMPTS).run();
 await env.DB.prepare(`UPDATE meeting_analysis_jobs SET status='failed',lease_id='',lease_until=0
 WHERE status='processing' AND lease_until<? AND attempts>=?`).bind(now,MAX_ATTEMPTS).run();
 const due=(await env.DB.prepare(`SELECT j.id FROM meeting_analysis_jobs j JOIN meeting_events e ON e.id=j.event_id
 WHERE e.state='analyzing' AND j.status IN ('pending','queued','retry') AND j.dispatch_at<=? LIMIT 300`).bind(now).all<{id:string}>()).results;
 for(let i=0;i<due.length;i+=100){
  const batch=due.slice(i,i+100);
  await env.MEETING_ANALYSIS_QUEUE.sendBatch(batch.map(j=>({body:{jobId:j.id}})));
  await env.DB.batch(batch.map(j=>env.DB.prepare(`UPDATE meeting_analysis_jobs SET status='queued',dispatch_at=?
    WHERE id=? AND status IN ('pending','queued','retry')`).bind(now+24*3600000,j.id)));
 }
 return due.length;
}
export async function startMeetingAnalysis(id:string){
 const event=await meeting(id);if(!event||event.closesAt>Date.now())throw new Error('締切時刻になってから集計できます。');
 if(event.state==='review'||event.state==='published')return;
 if(!env.MEETING_ANALYSIS_QUEUE)throw new Error('バックグラウンド分析の接続を確認してください。');
 const frozen=await env.DB.prepare(`UPDATE meeting_events SET state='analyzing' WHERE id=? AND state IN ('open','analyzing') AND lock_until<?`).bind(id,Date.now()).run();
 if(!frozen.meta.changes)throw new Error('従来の集計処理が終了するまでお待ちください。');
 await env.DB.prepare(`INSERT OR IGNORE INTO meeting_analysis_jobs(id,event_id,answer_id)
 SELECT event_id||':'||id,event_id,id FROM meeting_answers WHERE event_id=? AND present=1 AND analyzed=0`).bind(id).run();
 // Only explicit retry resets exhausted jobs. Already queued/running jobs are not duplicated.
 await env.DB.prepare(`UPDATE meeting_analysis_jobs SET status='pending',attempts=0,error='',dispatch_at=0
 WHERE event_id=? AND status='failed'`).bind(id).run();
 await finishEvent(id);
 try{await dispatchAnalysisJobs();}catch{console.error('Meeting analysis dispatch deferred to the recovery scheduler');}
}
export async function processAnalysisJob(jobId:string,ai:AIClient=env.MEETING_AI):Promise<'done'|'retry'> {
 await ensureMeetings();
 const job=await env.DB.prepare('SELECT * FROM meeting_analysis_jobs WHERE id=?').bind(jobId).first<Job>();
 if(!job)return 'done';const event=await meeting(job.event_id);
 if(!event||event.state!=='analyzing'||job.status==='failed'||job.status==='complete')return 'done';
 let stage='load',callCount=0;
 const lock=crypto.randomUUID();
 const acquired=await env.DB.prepare(`UPDATE meeting_analysis_jobs SET status='processing',attempts=attempts+1,lease_id=?,lease_until=?
 WHERE id=? AND status NOT IN ('failed','complete') AND lease_until<?`).bind(lock,Date.now()+LEASE_MS,jobId,Date.now()).run();
 if(!acquired.meta.changes)return 'retry';
 try{
  const all=(await attendees(job.event_id)).filter(p=>p.present===1),seeker=all.find(p=>p.id===job.answer_id);
  if(!seeker||seeker.analyzed){await env.DB.prepare("UPDATE meeting_analysis_jobs SET status='complete',lease_until=0 WHERE id=? AND lease_id=?").bind(jobId,lock).run();await finishEvent(job.event_id);return 'done';}
  // Cache only parsed, schema-validated inference steps; retry resumes the valid prefix.
  async function cacheKey(key:string){
   const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
   return Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  const client:AIClient={
   async run(model,inputs){
    stage=inputs.messages[0].content.startsWith('RELATED_REVIEW')?'related_review':inputs.messages[0].content.startsWith('RELATED_WORKFLOW')?'related_ranking':inputs.messages[0].content.includes('hardConstraints')?'direct_review':'direct_ranking';callCount++;
    return ai.run(model,inputs);
   },
   async readInference(key){
    const cached=await env.DB.prepare('SELECT result FROM meeting_analysis_cache WHERE job_id=? AND call_key=?').bind(jobId,await cacheKey(key)).first<{result:string}>();
    return cached?JSON.parse(cached.result):undefined;
   },
   async writeInference(key,result){
    await env.DB.prepare(`INSERT OR REPLACE INTO meeting_analysis_cache(job_id,call_key,result) SELECT ?,?,?
      WHERE EXISTS(SELECT 1 FROM meeting_analysis_jobs WHERE id=? AND lease_id=? AND status='processing')`).bind(jobId,await cacheKey(key),JSON.stringify(result),jobId,lock).run();
   },
  };
  const choices=await matchAttendee(client,seeker,all);
  await env.DB.batch([
   env.DB.prepare(`UPDATE meeting_answers SET candidates=?,analyzed=1 WHERE id=? AND event_id=? AND EXISTS
    (SELECT 1 FROM meeting_analysis_jobs WHERE id=? AND lease_id=? AND status='processing') AND EXISTS
    (SELECT 1 FROM meeting_events WHERE id=? AND state='analyzing')`).bind(JSON.stringify(choices),seeker.id,event.id,jobId,lock,event.id),
   env.DB.prepare("UPDATE meeting_analysis_jobs SET status='complete',error='',lease_until=0 WHERE id=? AND lease_id=?").bind(jobId,lock),
  ]);
  await env.DB.prepare('DELETE FROM meeting_analysis_cache WHERE job_id=?').bind(jobId).run();
  await finishEvent(event.id);return 'done';
 }catch(error){
  const message=error instanceof Error?error.message:'';
  const category=error instanceof SyntaxError?'invalid_json':/時間|timeout|timed out/i.test(message)?'timeout':/limit|429|rate/i.test(message)?'rate_limit':/審査|説明|形式|有効な回答/.test(message)?'invalid_shape':/D1|SQLITE|database/i.test(message)?'database':'inference_failure';
  const diagnostic=category+':'+stage;
  console.error('Meeting analysis failed',JSON.stringify({jobId,category,stage,callCount}));
  const attempt=await env.DB.prepare('SELECT attempts FROM meeting_analysis_jobs WHERE id=? AND lease_id=?').bind(jobId,lock).first<{attempts:number}>();
  // Never turn an AI failure into a fabricated 'no candidates' result.
  await env.DB.batch([
   env.DB.prepare("UPDATE meeting_analysis_jobs SET status=?,lease_until=0,lease_id='',error=?,dispatch_at=? WHERE id=? AND lease_id=?")
    .bind((attempt?.attempts??MAX_ATTEMPTS)>=MAX_ATTEMPTS?'failed':'retry',diagnostic,Date.now()+24*3600000,jobId,lock),
  ]);
  return (attempt?.attempts??MAX_ATTEMPTS)>=MAX_ATTEMPTS?'done':'retry';
 }
}
