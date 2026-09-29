import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import assert from 'node:assert/strict';
const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(stripTypeScriptTypes(source)).toString('base64');
const typesUrl=moduleUrl(readFileSync(new URL('../../app/meeting/types.ts',import.meta.url),'utf8'));
const {validateCandidates,validateAnswer}=await import(typesUrl);
const {matchAttendee,inferObject}=await import(moduleUrl(readFileSync(new URL('../../app/meeting/matching.ts',import.meta.url),'utf8').replace("'./types'",JSON.stringify(typesUrl))));
const base={name:'仮名',company:'架空社',table:'1',industry:'建築',services:'飲食店の給排水工事を行います。',referrals:'',need:'飲食店の給排水工事を依頼したい',area:'東京',timing:'',budget:'',conditions:'',present:1,analyzed:0,candidates:[]};
const seeker={...base,id:'s'}, provider={...base,id:'p',need:''};
const candidate={id:'p',kind:'direct',reason:'給排水工事の対応が一致',needQuote:'給排水工事',offerQuote:'給排水工事',questions:[]};
assert.equal(validateAnswer(base).company,'架空社');
assert.throws(()=>validateAnswer({...base,services:''}));
for(const row of [{...candidate,id:'other-event'},{...candidate,id:'s'},{...candidate,offerQuote:'一級建築士'},{...candidate,kind:'referral'}])assert.equal(validateCandidates([row],seeker,[provider]).length,0);
assert.equal(validateCandidates([candidate],seeker,[{...provider,present:0}]).length,1);
assert.equal(validateCandidates([candidate,candidate],seeker,[provider]).length,1);
let calls=0;
const ai={async run(_model,input){calls++;const data=JSON.parse(input.messages[1].content);if(data.requester){assert(!('name' in data.requester));assert(!('company' in data.requester));}return {response:JSON.stringify(data.request ? {decision:'accept',serviceMatch:true,hardConstraints:'satisfied',reason:'ok'} : {matches:[{...candidate,id:data.attendees[0].id}]})};}};
assert.equal((await matchAttendee(ai,seeker,[seeker,provider]))[0].id,'p');assert.equal(calls,3);
assert.deepEqual(await matchAttendee(ai,{...seeker,need:''},[provider]),[]);assert.equal(calls,3);
await assert.rejects(()=>matchAttendee({async run(){return {response:'invalid json'}}},seeker,[provider]));
assert.deepEqual(await matchAttendee({async run(){return {response:JSON.stringify({matches:[{...candidate,id:'forged'}]})}}},seeker,[provider]),[]);
console.log('PASS: answer validation, event isolation, legacy attendance ignored, self-match, exact evidence, referral evidence, duplicate removal, identity exclusion, independent verification, no-need, malformed output, forged ID');

assert.equal((await matchAttendee(ai,seeker,[seeker,{...provider,industry:'',walkIn:true}]))[0].id,'p');
console.log('PASS: self-entered walk-in business evidence participates in matching');

// A malformed output retries the failed step, not earlier validated inferences.
const checkpoint=new Map();let runs=0;
const resumable={
 async readInference(key){return checkpoint.get(key);},
 async writeInference(key,value){checkpoint.set(key,value);},
 async run(){runs++;return {response:runs===1?'truncated {':runs===2?'{"wrong":[]}':'{"matches":[]}'};},
};
const validate=value=>Array.isArray(value.matches);
assert.deepEqual(await inferObject(resumable,'fixture',{batch:1},validate),{matches:[]});
assert.equal(runs,3);assert.equal(checkpoint.size,1);
await inferObject(resumable,'fixture',{batch:1},validate);assert.equal(runs,3);
let failures=0;
await assert.rejects(()=>inferObject({...resumable,async run(){failures++;throw new Error('temporary failure');}},'fixture',{batch:2},validate));
assert.equal(failures,3);assert.equal(checkpoint.size,1);
await inferObject(resumable,'fixture',{batch:1},validate);assert.equal(runs,3);
assert.deepEqual(await inferObject(resumable,'fixture',{batch:2},validate),{matches:[]});
assert.equal(runs,4);assert.equal(checkpoint.size,2);
console.log('PASS: malformed JSON and invalid schema retry only one step; validated checkpoints survive later failure and resume without repeated calls');
