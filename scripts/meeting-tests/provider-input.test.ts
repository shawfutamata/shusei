import assert from 'node:assert/strict';
import {matchAttendee,type AIClient} from '../../app/meeting/matching';
import {person} from './fixtures';
const seeker=person('requester',{need:'新しい化粧品を開発したからこの宣伝、SNS運用、宣伝のポスティング、卸先、ケースなどのコラボができる会社募集'});
const provider=person('provider',{industry:'SNS運用',services:'SNS運用',need:'同じくSNS運用をお願いしたい',conditions:'提供能力とは関係のない別の希望'});
let calls=0;
const ai={async run(_model:string,input:Parameters<AIClient['run']>[1]){calls++;const data=JSON.parse(input.messages[1].content);
 if(data.attendees){for(const p of data.attendees){assert.equal('need' in p,false);assert.equal('conditions' in p,false);assert.equal('budget' in p,false);assert.equal('timing' in p,false)}
 return {response:JSON.stringify({matches:[{id:'p1',kind:'direct',reason:'SNS運用の協業先として該当',needQuote:'SNS運用',offerQuote:'SNS運用',questions:[]}]})}}
 return {response:JSON.stringify({decision:'accept',serviceMatch:true,hardConstraints:'satisfied',reason:'原文の事業に一致'})};
}};
const matches=await matchAttendee(ai,seeker,[seeker,provider]);assert.equal(matches.length,1);assert.equal(matches[0].id,'provider');assert.equal(calls,3);
const empty=await matchAttendee(ai,{...seeker,need:''},[seeker,provider]);assert.deepEqual(empty,[]);
console.log('PASS: cooperation request uses provider business facts, excludes other participants’ requests, and keeps empty requests unmatched');

let rejectedCalls=0;
const unsupported:AIClient={async run(){rejectedCalls++;return {response:JSON.stringify({matches:[{id:'p1',kind:'direct',reason:'希望が同じ',needQuote:'SNS運用',offerQuote:'SNS運用',questions:[]}]})}}};
assert.deepEqual(await matchAttendee(unsupported,seeker,[seeker,{...provider,industry:'飲食',services:'飲食店を経営しています。'}]),[]);
assert.equal(rejectedCalls,2);
console.log('PASS: unsupported suggestions are retried once and excluded without blocking the meeting');
