import assert from 'node:assert/strict';
import { matchAttendee, type AIClient } from '../../app/meeting/matching';
import { evidenceConnectionCandidates, evidenceDirectCandidates, evidenceRelatedCandidates } from '../../app/meeting/evidence';
import { person } from './fixtures';

const seeker=person('seeker',{need:'事務所移転で引越しとWiFiの配線工事を別々の会社に依頼したい。'});
const mover=person('mover',{industry:'運送',services:'引越・不用品回収を行っています。'});
const electrician=person('electrician',{industry:'電気設備',services:'オフィスの配線工事・LAN工事を施工します。'});
const unavailable=person('unavailable',{services:'引越は対応外です。清掃のみ承ります。'});
const seekingMover=person('seeking-mover',{services:'引越業者を探しています。'});
const seeds=evidenceDirectCandidates(seeker,[unavailable,mover,seekingMover,electrician]);
assert.deepEqual(seeds.map(c=>c.id),['electrician','mover']);
assert.equal(seeds.find(c=>c.id==='mover')?.needQuote,'引越し');
assert.equal(seeds.find(c=>c.id==='electrician')?.offerQuote,'配線工事');

const ai:AIClient={async run(_model,input){
 const system=input.messages[0].content;
 if(system.includes('hardConstraints'))return {response:JSON.stringify({decision:'accept',serviceMatch:true,hardConstraints:'satisfied',reason:'事業内容に明記'})};
 if(system.startsWith('RELATED_REVIEW'))return {response:JSON.stringify({decision:'reject'})};
 return {response:JSON.stringify({matches:[]})};
}};
const matches=await matchAttendee(ai,seeker,[seeker,unavailable,mover,seekingMover,electrician]);
assert.deepEqual(matches.map(c=>c.id),['electrician','mover']);
assert.ok(matches.every(c=>c.kind==='direct'));
assert.deepEqual(evidenceDirectCandidates({...seeker,need:'引越しと配線工事を一社にまとめて依頼したい'},[mover,electrician]),[]);

const poster=person('poster',{need:'新しい化粧品を宣伝するためにポスティングしたい。'});
const printer=person('printer',{industry:'印刷',services:'会社案内とチラシの印刷をしています。'});
const packaging=person('packaging',{industry:'包装',services:'化粧品のパッケージと化粧箱を製作しています。'});
const printOnly=person('print-only',{services:'チラシの印刷専門。ポスティングは対応外です。'});
assert.deepEqual(evidenceDirectCandidates(poster,[printer,packaging,printOnly]),[]);
assert.deepEqual(evidenceRelatedCandidates(poster,[printer,packaging,printOnly]).map(c=>c.id),['printer','packaging']);
const publisher=person('publisher',{need:'本の企画について相談したい講師・カウンセラー・タレントの方とつながりたい。'});
const talent=person('talent',{industry:'女優・タレント',services:'役者とセミナー講師として活動しています。'});
const sameWish=person('same-wish',{industry:'出版',services:'本の編集と出版を行います。',need:'タレントとつながりたい。'});
assert.deepEqual(evidenceConnectionCandidates(publisher,[sameWish,talent]).map(c=>c.id),['talent']);
console.log('PASS: evidence recall covers separate jobs and adjacent workflows without turning unmet or negative services into direct matches');
