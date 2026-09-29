import type { Answer, RosterPerson } from './types';
export const profileFields = ['name','company','table','industry','services','area'] as const;
export const rosterLabels = {name:'氏名',company:'会社名',table:'テーブル',industry:'業種',services:'事業内容',area:'対応地域'};
const aliases = {name:['氏名','名前','お名前','会員名','参加者名'],company:['会社名','会社','企業名','屋号','会社・屋号'],table:['テーブル','テーブル番号','席番号','テーブル・席番号'],industry:['業種','業種名','ご自身の業種'],services:['事業内容','仕事内容','取扱商品','提供サービス','できる仕事','業種詳細'],area:['対応地域','対応エリア','活動エリア','エリア']};
export function normalizedName(value:string) {return value.normalize('NFKC').replace(/[\s　]/g,'').toLowerCase();}
export function guessColumns(headers:string[]) {
  return Object.fromEntries(profileFields.map(key=>[key,headers.findIndex(h=>aliases[key].includes(h.trim()))])) as Record<typeof profileFields[number],number>;
}
// CSV quotes, embedded newlines and tab-separated Excel paste are handled without executing cells.
export function parseDelimited(text:string):string[][] {
  if(text.length>1000000)throw new Error('名簿は1MB以下にしてください。');
  const separator=text.split(/\r?\n/)[0].includes('\t')?'\t':',';
  const rows:string[][]=[];let row:string[]=[],cell='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&c===separator){row.push(cell);cell='';}
    else if(!quoted&&(c==='\n'||c==='\r')){if(c==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(v=>v.trim()))rows.push(row);row=[];cell='';}
    else cell+=c;
  }
  if(quoted)throw new Error('CSVの引用符が閉じていません。');
  row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
  return rows.map(r=>r.map(v=>v.replace(/^\uFEFF/,'').trim()));
}
// The meeting export has no header: number, first/second table, mark, venue,
// company, role, full name, original business description, status/inviter, reading.
// Detect every row rather than guessing from a single person's data.
export function prepareRosterRows(data:string[][]) {
  const exported=data.length>0&&data.every((r,i)=>r.length===11&&r[0]===String(i+1)&&
    /^[A-Z](?:★)?$|^#$|^$/.test(r[1])&&/^[A-Z](?:★)?$|^$/.test(r[2])&&
    (r[3]==='#'||r[3]==='')&&!!r[4]&&!!r[5]&&!!r[7]&&!!r[10]);
  if(exported) {
    const headers=['番号','テーブル1','テーブル2','印','所属会場','会社名','役職','氏名','事業内容','会員区分・紹介者','ふりがな'];
    const columns=guessColumns(headers);
    // There are two table assignments. The operator explicitly chooses one.
    return {rows:[headers,...data],columns,format:'meeting-export' as const};
  }
  return {rows:data,columns:guessColumns(data[0]??[]),format:'standard' as const};
}
export function validateRoster(raw:unknown):Omit<RosterPerson,'id'>[] {
  if(!Array.isArray(raw)||!raw.length||raw.length>100)throw new Error('名簿は1〜100人で取り込んでください。');
  const seen=new Set<string>();
  return raw.map((row,index)=>{
    if(!row||typeof row!=='object')throw new Error(`${index+1}行目の形式を確認してください。`);
    const p={} as Omit<RosterPerson,'id'>;
    for(const key of profileFields){const v=(row as Record<string,unknown>)[key];p[key]=typeof v==='string'?v.trim():'';if(p[key].length>(key==='services'?500:120))throw new Error(`${index+1}行目の${rosterLabels[key]}が長すぎます。`);}
    if(!p.name||!p.company)throw new Error(`${index+1}行目の氏名・会社名を確認してください。`);
    // An industry-only roster is valid; keep it as the sole capability evidence.
    p.services ||= p.industry;
    // Missing business information stays empty: the person may request an introduction,
    // but is not evidence of an offer or an industry.
    const key=normalizedName(p.name)+'|'+normalizedName(p.company);
    if(seen.has(key))throw new Error(`${index+1}行目に同じ氏名・会社名があります。重複を確認してください。`);
    seen.add(key);return p;
  });
}
export function rosterAnswer(profile:Omit<RosterPerson,'id'>,need:string):Answer {
  return {...profile,need,referrals:'',timing:'',budget:'',conditions:''};
}
