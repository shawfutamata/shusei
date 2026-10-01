import assert from 'node:assert/strict';
import {matchAttendee,type AIClient} from '../../app/meeting/matching';
import {person} from './fixtures';

const requester=person('requester',{need:'オフィス移転の関係で、引越しをしてくれる会社、wifiなどの電気関連の配線工事を依頼できる会社。'});
const mover=person('mover',{industry:'運送業',services:'運送。引越、処分、リサイクルを行なっている会社です。'});
const ai:AIClient={async run(_model,input){
 const system=input.messages[0].content;
 const data=JSON.parse(input.messages[1].content);
 if(system.includes('hardConstraints')){
  assert.equal(data.request.need,'引越し');
  assert.equal(data.proposal.offerQuote,'引越');
  return {response:JSON.stringify({decision:'accept',serviceMatch:true,hardConstraints:'satisfied',reason:'引越の事業記載がある'})};
 }
 return {response:JSON.stringify({matches:[]})};
}};

const matches=await matchAttendee(ai,requester,[requester,mover]);
assert.equal(matches.length,1);
assert.equal(matches[0].id,'mover');
assert.equal(matches[0].kind,'direct');
assert.match(matches[0].reason,/引越/);
assert.doesNotMatch(matches[0].reason,/配線工事/);

const bundled={...requester,need:'引越しと配線工事を一社にまとめて依頼できる会社を探しています。'};
assert.deepEqual(await matchAttendee(ai,bundled,[bundled,mover]),[]);
const unavailable={...mover,services:'運送のみ。引越は対応外です。'};
assert.deepEqual(await matchAttendee(ai,requester,[requester,unavailable]),[]);
console.log('PASS: an explicit moving service covers only the moving facet; bundled and unavailable work are excluded');

const multipleIndustries=person('multiple-industries',{industry:'引越し、税理士',services:'法人税務の相談を受けています。'});
const taxRequester=person('tax-requester',{need:'税理士とつながりたい'});
const taxMatches=await matchAttendee(ai,taxRequester,[taxRequester,multipleIndustries]);
assert.equal(taxMatches.length,1);
assert.equal(taxMatches[0].id,'multiple-industries');
assert.equal(taxMatches[0].offerQuote,'税理士');
console.log('PASS: a secondary industry can be matched and quoted on its own');
