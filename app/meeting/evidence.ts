import type { Attendee, Candidate } from './types';

type Service = {key:string;need:RegExp;offer:RegExp;question:string};
// These are recall rules, not a claim that a company can perform every task in
// a request. The independent constraint review still checks each proposed pair.
const services:Service[] = [
 {key:'moving',need:/引越し|引っ越し|引越|オフィス移転|事務所移転/,offer:/引越し|引っ越し|引越|事務所移転|オフィス移転/,question:'引越しの対応範囲と日程を確認できますか？'},
 {key:'wiring',need:/配線工事|電気工事|電源工事|LAN工事|ネットワーク配線/,offer:/配線工事|電気工事|電源工事|LAN工事|ネットワーク配線/,question:'必要な配線工事に対応していますか？'},
 {key:'wifi',need:/Wi-?Fi|無線LAN|ネット環境|インターネット回線/,offer:/Wi-?Fi|無線LAN|ネットワーク構築|インターネット回線/,question:'回線・無線LANのどこまで対応できますか？'},
 {key:'cleaning',need:/清掃|クリーニング|原状回復|ハウスクリーニング/,offer:/清掃|クリーニング|原状回復|ハウスクリーニング/,question:'現場と作業範囲に対応できますか？'},
 {key:'disposal',need:/不用品回収|不用品処分|廃品回収|残置物撤去/,offer:/不用品回収|不用品処分|廃品回収|残置物撤去/,question:'回収できる品目と地域を確認できますか？'},
 {key:'posting',need:/ポスティング|チラシ配布|ビラ配り/,offer:/ポスティング|チラシ配布|ビラ配り/,question:'配布地域と実施方法を確認できますか？'},
 {key:'printing',need:/チラシ.*印刷|印刷.*チラシ|パンフレット.*印刷|印刷会社|印刷を/,offer:/印刷|チラシ|パンフレット|カタログ/,question:'希望する印刷物の制作・印刷に対応できますか？'},
 {key:'sns',need:/SNS運用|インスタ運用|Instagram運用|SNS集客/,offer:/SNS運用|インスタ運用|Instagram運用|SNS集客/,question:'運用する媒体と支援範囲を確認できますか？'},
 {key:'marketing',need:/広告運用|宣伝支援|販促|プロモーション/,offer:/広告運用|宣伝支援|販促|プロモーション/,question:'希望する宣伝施策に対応できますか？'},
 {key:'web',need:/ホームページ制作|Web制作|サイト制作|LP制作/,offer:/ホームページ制作|Web制作|サイト制作|LP制作/,question:'必要なページの制作範囲を確認できますか？'},
 {key:'packaging',need:/商品ケース|化粧箱|パッケージ|包装資材/,offer:/商品ケース|化粧箱|パッケージ|包装資材/,question:'商品の形状に合うケースや包装に対応できますか？'},
 {key:'photo',need:/商品撮影|写真撮影|撮影会社|カメラマン/,offer:/商品撮影|写真撮影|撮影|カメラマン/,question:'希望する撮影内容に対応できますか？'},
 {key:'tax',need:/税理士|税務相談|決算|記帳代行/,offer:/税理士|税務相談|決算|記帳代行/,question:'相談内容と担当範囲を確認できますか？'},
 {key:'legal',need:/弁護士|契約書.*相談|法務相談/,offer:/弁護士|法務相談|契約書/,question:'相談内容と資格・担当範囲を確認できますか？'},
 {key:'interior',need:/内装工事|店舗内装|リフォーム|改装工事/,offer:/内装工事|店舗内装|リフォーム|改装工事/,question:'施工内容と地域に対応できますか？'},
 {key:'recruitment',need:/採用支援|人材紹介|人材募集|求人広告/,offer:/採用支援|人材紹介|求人広告|採用代行/,question:'募集する職種に対応できますか？'},
];

function safeOffer(source:string,quote:string) {
 const at=source.indexOf(quote);
 if(at<0)return false;
 const context=source.slice(Math.max(0,at-12),Math.min(source.length,at+quote.length+18));
 return !/(対応外|非対応|できません|行いません|しません|取り扱いなし|提供していません|専門外|不可|やっていません)/.test(context)
  && !new RegExp(`${quote.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}.{0,8}(紹介|探して|依頼したい|募集)`).test(context);
}

export function evidenceDirectCandidates(seeker:Attendee,providers:Attendee[]):Candidate[] {
 // A single contractor is required for the whole bundle: matching one part
 // would give the requester a misleading answer.
 if(/(一社|同じ会社|一つの会社|一括|まとめて|両方).{0,20}(対応|依頼|お願い|できる)/.test(seeker.need))return [];
 const matches:{candidate:Candidate;facet:string;score:number}[]=[];
 for(const provider of providers) {
  if(provider.id===seeker.id||!provider.services)continue;
  for(const service of services) {
   const need=service.need.exec(seeker.need);
   const offer=service.offer.exec(provider.services);
   if(!need||!offer||!safeOffer(provider.services,offer[0]))continue;
   const needQuote=service.key==='moving' ? /引越し|引っ越し|引越/.exec(seeker.need)?.[0]??need[0] : need[0];
   matches.push({facet:service.key,score:needQuote.length+offer[0].length,candidate:{id:provider.id,kind:'direct',reason:'希望の仕事と名簿の事業内容が一致しています。',needQuote,offerQuote:offer[0],questions:[service.question]}});
  }
 }
 // Cover distinct requested jobs before recommending several providers for
 // one job. Do not let roster order determine the shortlist.
 matches.sort((a,b)=>b.score-a.score||a.candidate.id.localeCompare(b.candidate.id));
 const output:Candidate[]=[],seen=new Set<string>(),facets=new Set<string>();
 for(const distinct of [true,false])for(const hit of matches) {
  if(seen.has(hit.candidate.id)||(distinct&&facets.has(hit.facet)))continue;
  output.push(hit.candidate);seen.add(hit.candidate.id);facets.add(hit.facet);
 }
 return output;
}

type Connection={need:RegExp;identity:RegExp;question:string};
// A person looking for a customer or collaborator should be matched to that
// person's stated line of work, not to another person's identical wish.
const connections:Connection[]=[
 {need:/不動産会社|不動産業者|不動産屋/,identity:/不動産取引|不動産仲介|不動産業|不動産屋/,question:'どのような物件・案件で協業できますか？'},
 {need:/美容サロン|エステサロン/,identity:/美容サロン|サロン経営|エステサロン/,question:'商品やサービスの連携に関心がありますか？'},
 {need:/運送会社|運送業者/,identity:/運送業|運送会社|運送。|運送事業/,question:'案件の紹介や協業について相談できますか？'},
 {need:/IT会社|システム会社/,identity:/IT事業|システム開発|システム会社/,question:'どの領域で連携できますか？'},
 {need:/講師|セミナー講師/,identity:/講師|セミナー講師/,question:'企画・出版についてお話しできますか？'},
 {need:/カウンセラー|カウンセリング/,identity:/カウンセラー|カウンセリング/,question:'希望する協業内容をご相談できますか？'},
 {need:/タレント|俳優|女優/,identity:/タレント|俳優|女優/,question:'企画についてお話しできますか？'},
 {need:/栄養士/,identity:/栄養士/,question:'提案できる分野や協業方法をご相談できますか？'},
 {need:/マッサージ/,identity:/マッサージ/,question:'一緒に提案する内容をご相談できますか？'},
 {need:/化粧品卸/,identity:/化粧品.{0,8}卸/,question:'扱う商品や卸先の条件を確認できますか？'},
 {need:/集客支援の会社|集客支援会社/,identity:/集客支援|広告運用|SNS運用/,question:'集客支援の担当範囲をご相談できますか？'},
];
export function evidenceConnectionCandidates(seeker:Attendee,providers:Attendee[]):Candidate[] {
 const hits:{facet:number;candidate:Candidate}[]=[];
 for(const [facet,role] of connections.entries()) {
  const need=role.need.exec(seeker.need);if(!need)continue;
  for(const provider of providers) {
   if(provider.id===seeker.id)continue;
   const identity=role.identity.exec(provider.industry)||role.identity.exec(provider.services);
   if(!identity||!safeOffer(provider.industry+'\n'+provider.services,identity[0]))continue;
   hits.push({facet,candidate:{id:provider.id,kind:'direct',reason:'希望する業種・協業相手と名簿の事業情報が一致しています。',needQuote:need[0],offerQuote:identity[0],questions:[role.question]}});
  }
 }
 const output:Candidate[]=[],seen=new Set<string>(),facets=new Set<number>();
 for(const distinct of [true,false])for(const hit of hits) {
  if(seen.has(hit.candidate.id)||(distinct&&facets.has(hit.facet)))continue;
  output.push(hit.candidate);seen.add(hit.candidate.id);facets.add(hit.facet);
 }
 return output;
}

type Workflow={trigger:RegExp;needLabel:string;offer:RegExp;step:string;question:string};
const workflows:Workflow[]=[
 {trigger:/ポスティング|チラシ配布|ビラ配り/,needLabel:'配布物',offer:/チラシ|印刷|パンフレット|カタログ|会社案内/,step:'配布物の制作・印刷',question:'配布に使うチラシの制作・印刷に対応できますか？'},
 {trigger:/新商品|化粧品|商品開発|商品を販売/,needLabel:'商品',offer:/パッケージ|化粧箱|包装資材|商品ケース/,step:'商品のパッケージ・ケース',question:'この商品のケースや包装について相談できますか？'},
 {trigger:/新商品|化粧品|商品開発|商品を販売/,needLabel:'商品',offer:/商品撮影|物撮り/,step:'販促用の商品撮影',question:'商品の販促写真を撮影できますか？'},
 {trigger:/オフィス移転|事務所移転|引越し|引っ越し/,needLabel:'移転',offer:/不用品回収|不用品処分|残置物撤去/,step:'移転時の不用品回収',question:'移転時の不用品回収を相談できますか？'},
 {trigger:/オフィス移転|事務所移転/,needLabel:'移転',offer:/配線工事|LAN工事|ネットワーク構築/,step:'移転先の配線・ネットワーク整備',question:'移転先の配線やネットワーク整備を相談できますか？'},
];
export function evidenceRelatedCandidates(seeker:Attendee,providers:Attendee[]):Candidate[] {
 const output:Candidate[]=[],seen=new Set<string>();
 for(const workflow of workflows) {
  const need=workflow.trigger.exec(seeker.need);if(!need)continue;
  for(const provider of providers) {
   if(provider.id===seeker.id||seen.has(provider.id))continue;
   const source=provider.services||provider.industry,offer=workflow.offer.exec(source);
   if(!offer||!safeOffer(source,offer[0]))continue;
   output.push({id:provider.id,kind:'related',step:workflow.step,reason:`${workflow.needLabel}に必要な${workflow.step}の相談先です。`,needQuote:need[0],offerQuote:offer[0],questions:[workflow.question]});
   seen.add(provider.id);
  }
 }
 return output;
}
