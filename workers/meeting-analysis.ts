import {dispatchAnalysisJobs,processAnalysisJob} from '../db/meeting-analysis';
export default {
 async queue(batch:MessageBatch<{jobId:string}>){
  for(const message of batch.messages){
   try{const outcome=await processAnalysisJob(message.body.jobId);if(outcome==='retry')message.retry({delaySeconds:Math.min(300,30*message.attempts)});else message.ack();}
   catch{message.retry({delaySeconds:60});}
  }
 },
 async scheduled(){await dispatchAnalysisJobs();},
};
