import {dispatchAnalysisJobs,processAnalysisJob} from '../db/meeting-analysis';
import {dispatchPreanalysis,processPreanalysis} from '../db/meeting-preanalysis';
export default {
 async queue(batch:MessageBatch<{jobId:string;preanalysis?:boolean}>){
  for(const message of batch.messages){
   try{const outcome=await (message.body.preanalysis?processPreanalysis(message.body.jobId):processAnalysisJob(message.body.jobId));if(outcome==='retry')message.retry({delaySeconds:Math.min(300,30*message.attempts)});else message.ack();}
   catch{message.retry({delaySeconds:60});}
  }
 },
 async scheduled(){await dispatchAnalysisJobs();await dispatchPreanalysis();},
};
