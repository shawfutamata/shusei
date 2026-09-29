import assert from 'node:assert/strict';
import {matchAttendee,type AIClient} from '../../app/meeting/matching';
import {person} from './fixtures';
const seeker=person('requester',{need:'新しい化粧品の宣伝のポスティングをしたいです。'});
const printer=person('printer',{industry:'',services:'名刺、カタログ、会社案内、等からデータアウトソーシングまで',need:'ポスティングを実施してくれる人を探したい'});
const wrong=person('wrong',{industry:'',services:'全国対応',need:'チラシを印刷できます'});
let relatedCalls=0;
const ai:AIClient={async run(_model,input){const system=input.messages[0].content;const data=JSON.parse(input.messages[1].content);
 if(system.startsWith('RELATED_WORKFLOW')){relatedCalls++;for(const p of data.attendees)assert.equal('need' in p,false);
 return {response:JSON.stringify({matches:[{id:'p1',kind:'related',step:'配布するチラシの制作・印刷',reason:'配布物の制作・印刷の相談先として考えられます。配布そのものへの対応は確認が必要です。',needQuote:'宣伝のポスティング',offerQuote:'名刺、カタログ、会社案内',questions:['ポスティング用チラシの制作・印刷に対応していますか？']},{id:'p2',kind:'related',step:'配布するチラシの制作・印刷',reason:'希望から提供能力を推測',needQuote:'ポスティング',offerQuote:'チラシを印刷できます',questions:['印刷できますか？']}]})};}
 if(system.startsWith('RELATED_REVIEW'))return {response:JSON.stringify({decision:'accept',reason:'ポスティングで配布するチラシの制作・印刷を相談する相手として関連します。配布自体への対応は名簿に記載がありません。',questions:['ポスティング用チラシの制作・印刷に対応していますか？']})};
 return {response:'{"matches":[]}'};
}};
const matches=await matchAttendee(ai,seeker,[seeker,printer,wrong]);
assert.equal(matches.length,1);assert.equal(matches[0].id,'printer');assert.equal(matches[0].kind,'related');assert.ok(matches[0].questions.length);assert.equal(relatedCalls,1);
assert.deepEqual(await matchAttendee(ai,{...seeker,need:'ネットワークビジネスへの勧誘'},[seeker,printer]),[]);
assert.equal((await matchAttendee(ai,seeker,[seeker,{...printer,present:0}]))[0].id,'printer');
console.log('PASS: posting finds print collateral, provider wants do not become capabilities, legacy attendance does not exclude valid providers, and prohibited requests remain excluded');
