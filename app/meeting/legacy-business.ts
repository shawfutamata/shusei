import type { RosterPerson } from './types';

export type LegacyBusiness = {name:string;company:string;industry:string;pr:string};
const key=(s:string)=>s.normalize('NFKC').replace(/\s/g,'').toLowerCase();
function decode(s:string){return s.replace(/&(#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,(_,entity:string)=>{
 if(entity[0]==='#'){const n=entity[1].toLowerCase()==='x'?parseInt(entity.slice(2),16):Number(entity.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):'';}
 return ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '} as Record<string,string>)[entity.toLowerCase()];
});}
function attributes(tag:string){return Object.fromEntries([...tag.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/g)].map(m=>[m[1].toLowerCase(),decode(m[2]??m[3]??m[4]??'')]));}
// Parse only the known read-only member form fields. Never import contact details,
// hidden tokens, administrator notes or permissions.
export function parseLegacyBusiness(html:string):LegacyBusiness {
 const fields=new Map<string,string>();
 for(const m of html.matchAll(/<input\b[^>]*>|<textarea\b[^>]*>[\s\S]*?<\/textarea\s*>/gi)){
  const a=attributes(m[0].slice(0,m[0].indexOf('>')+1));
  if(a.name)fields.set(a.name,m[0].toLowerCase().startsWith('<textarea')?decode(m[0].slice(m[0].indexOf('>')+1).replace(/<\/textarea\s*>$/i,'')).trim():(a.value||'').trim());
 }
 const value=(name:string)=>fields.get(`member[${name}]`)||'';
 const name=[value('member_namel'),value('member_namef')].filter(Boolean).join(' '),company=value('company_name');
 if(!name||!company||!fields.has('member[company_pr]'))throw new Error('会員の事業概要を取得できません。ログインと会員情報を確認してください。');
 return {name,company,industry:value('company_type'),pr:value('company_pr')};
}
export function legacyBusinessLinks(html:string,names:string[]){
 const wanted=new Set(names.map(key)),links=new Set<string>();
 for(const m of html.matchAll(/<a\b[^>]*>[\s\S]*?<\/a\s*>/gi)){
  const href=attributes(m[0].slice(0,m[0].indexOf('>')+1)).href;
  if(!href)continue;
  const u=new URL(href,'https://www.shuseiclub.jp/hirunomeguro/___STAFF___/member/');
  if(u.origin!=='https://www.shuseiclub.jp'||u.pathname!=='/hirunomeguro/___STAFF___/member/member_detail.php'||!/^\d+$/.test(u.searchParams.get('id')||''))continue;
  const text=decode(m[0].slice(m[0].indexOf('>')+1).split(/<br\b[^>]*>/i)[0].replace(/<[^>]*>/g,'')).trim();
  if(wanted.has(key(text)))links.add(u.href);
 }
 return [...links];
}
export function enrichLegacyBusiness(profile:Omit<RosterPerson,'id'>,details:LegacyBusiness[]){
 const found=details.filter(p=>key(p.name)===key(profile.name)&&key(p.company)===key(profile.company));
 // Names alone are not sufficient evidence of a company association.
 if(found.length!==1)return profile;
 const p=found[0],parts=[...profile.services.trim().split(/\n+/),p.pr.trim()].filter(Boolean);
 const services=parts.filter((s,i)=>!parts.some((other,j)=>j!==i&&key(other).includes(key(s))&&(key(other)!==key(s)||j<i))).join('\n');
 return {...profile,industry:p.industry||profile.industry,services:services||p.industry||profile.services};
}
