// TSX state only: no real browser or network.
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {build} from 'esbuild';
const built=await build({entryPoints:['app/settings/line/check/LinkCheck.tsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react'],loader:{'.module.css':'empty'},jsx:'transform',jsxFactory:'__ui.createElement',tsconfigRaw:{compilerOptions:{jsx:'react',paths:{'@/*':['./*']}}}});
function all(n,p){if(!n||typeof n!=='object')return[];if(Array.isArray(n))return n.flatMap(x=>all(x,p));return[...(p(n)?[n]:[]),...(n.children||[]).flatMap(x=>all(x,p))];}
function fixture(linked=false, options={}) {
 let initialMessage=options.message||'',cursor=0, now=10000000, visible='visible';
 const slots=[],requests=[],moves=[],reloads=[],listeners=new Map(),docListeners=new Map(),storage=new Map(),loaded={exports:{}},effects=[];
 if(options.pending!==undefined)storage.set('tasuki:owner-line-check:pending',String(options.pending));
 const hooks={useState(v){const i=cursor++;if(!(i in slots))slots[i]=v;return[slots[i],x=>slots[i]=x];},useRef(v){const i=cursor++;if(!(i in slots))slots[i]={current:v};return slots[i];},useEffect(f,deps){const i=cursor++;const prev=slots[i];if(!prev||deps.some((x,j)=>x!==prev.deps[j])){effects.push(()=>{prev?.cleanup?.();slots[i]={deps,cleanup:f()};});}}};
 const store={getItem:k=>{if(options.storageThrows)throw Error();return storage.get(k)??null;},setItem:(k,v)=>{if(options.storageThrows)throw Error();storage.set(k,v);},removeItem:k=>{if(options.storageThrows)throw Error();storage.delete(k);}};
 vm.runInNewContext(built.outputFiles[0].text,{module:loaded,exports:loaded.exports,require:n=>{assert.equal(n,'react');return hooks;},__ui:{createElement:(type,props,...children)=>({type,props:props||{},children})},AbortController,URL,URLSearchParams,Date:{now:()=>now},setTimeout:()=>1,clearTimeout:()=>{},document:{get visibilityState(){return visible;},addEventListener:(k,v)=>docListeners.set(k,v),removeEventListener:k=>docListeners.delete(k)},window:{sessionStorage:store,addEventListener:(k,v)=>listeners.set(k,v),removeEventListener:k=>listeners.delete(k),location:{assign:u=>moves.push(u),reload:()=>reloads.push(true)}},fetch:(url,options)=>new Promise(resolve=>{assert.equal(url,'/api/auth/line/start');requests.push({options,resolve});})});
 const render=()=>{cursor=0;const result=loaded.exports.default({email:'owner@example.invalid',linked,initialMessage});while(effects.length)effects.shift()();return result;};
 const nodes=p=>{render();return all(render(),p);};
 return{update:(message,isLinked=linked)=>{initialMessage=message;linked=isLinked;render();},nodes,requests,moves,reloads,storage,advance:ms=>now+=ms,visible:()=>{visible='visible';docListeners.get('visibilitychange')();},show:persisted=>listeners.get('pageshow')({persisted}),check:()=>nodes(n=>n.type==='input')[0].props.onChange({target:{checked:true}}),click:()=>nodes(n=>n.type==='button'&&n.children.some(x=>typeof x==='string'&&(x.includes('本人のLINE')||x.includes('本人確認を開いて'))))[0].props.onClick(),hide:()=>listeners.get('pagehide')(),async reply(url){requests.at(-1).resolve({ok:true,json:async()=>({authorizeUrl:url})});for(let i=0;i<12;i++)await Promise.resolve();render();}};
}
let f=fixture();assert.equal(f.nodes(n=>n.type==='button')[0].props.disabled,true);f.click();assert.equal(f.requests.length,0);f.check();f.click();f.click();assert.equal(f.requests.length,1);assert.deepEqual(Object.fromEntries(new URLSearchParams(f.requests[0].options.body)),{action:'owner_link_check',consent:'yes'});assert.equal(f.nodes(n=>n.type==='button')[0].props.disabled,true);await f.reply('https://access.line.me/oauth2/v2.1/authorize?state=fake');assert.equal(f.moves.length,1);
f=fixture();f.check();f.click();f.hide();f.show(true);assert.equal(f.reloads.length,1);await f.reply('https://access.line.me/oauth2/v2.1/authorize?state=fake');assert.equal(f.moves.length,0);
f=fixture();f.check();f.click();await f.reply('https://evil.example/');assert.equal(f.moves.length,0);
f=fixture(true);assert.equal(f.nodes(n=>n.type==='button').length,0);assert.equal(f.requests.length,0);
f=fixture();f.nodes(()=>false);f.show(false);assert.equal(f.reloads.length,0,'ordinary pageshow does not reload');assert.equal(f.requests.length,0);f.show(true);assert.equal(f.reloads.length,1,'BFCache restore reloads server state');assert.equal(f.requests.length,0,'restore does not start authentication');
console.log('PASS TSX consent/double-click/action/redirect/pagehide/linked-state; no network');

f=fixture();f.nodes(()=>false);f.update('サーバーの新しい結果');assert.ok(f.nodes(n=>n.props.role==='status')[0].children.includes('サーバーの新しい結果'),'updated server result is visible');

const status=f=>f.nodes(n=>n.props.role==='status')[0].children.join('');
const pending='tasuki:owner-line-check:pending';
f=fixture(false,{pending:10000000});assert.match(status(f),/完了をまだ確認できません/);assert.match(status(f),/完了をまだ確認できません/);assert.equal(f.requests.length,0);f.nodes(n=>n.type==='button'&&n.children.includes('連携状況を再確認する'))[0].props.onClick();assert.equal(f.reloads.length,1);
f.update('サーバーからの競合結果');assert.equal(status(f),'サーバーからの競合結果');assert.equal(f.storage.size,0);
f=fixture(false,{pending:10000000});status(f);f.update('',true);assert.match(status(f),/LINEは連携済み/);assert.equal(f.storage.size,0);
for(const invalid of ['NaN','Infinity','',10000001,9400000,0]){f=fixture(false,{pending:invalid});assert.doesNotMatch(status(f),/完了をまだ/);assert.equal(f.storage.size,0);}
f=fixture();assert.doesNotMatch(status(f),/完了をまだ/);f.visible();assert.doesNotMatch(status(f),/完了をまだ/);
f=fixture(false,{message:'過去のエラー'});f.check();f.click();assert.equal(status(f),'過去のエラー');assert.ok(f.nodes(n=>n.type==='button')[0].children.includes('本人確認を開いています…'));await f.reply('https://access.line.me/oauth2/v2.1/authorize?state=fake');assert.equal(f.storage.get(pending),'10000000');f.hide();assert.equal(f.storage.size,1);f.visible();assert.equal(status(f),'過去のエラー');assert.equal(f.requests.length,1);f.update('過去のエラー');assert.equal(status(f),'過去のエラー');f.update('新しい結果');assert.equal(status(f),'新しい結果');assert.equal(f.storage.size,0);
f=fixture(false,{storageThrows:true});f.check();f.click();await f.reply('https://access.line.me/oauth2/v2.1/authorize?state=fake');assert.equal(f.moves.length,1);f.visible();f.update('確定結果');assert.equal(status(f),'確定結果');
f=fixture();f.check();f.click();await f.reply('https://evil.example/');assert.match(status(f),/開始できませんでした/);assert.equal(f.storage.size,0);f.visible();assert.match(status(f),/開始できませんでした/);
f=fixture(false,{pending:10000000});status(f);f.advance(600000);f.visible();assert.equal(f.storage.size,0);
console.log('PASS updated props, pending return, result priority, expiry, storage exceptions, no automatic auth');

f=fixture();f.check();f.click();await f.reply('https://access.line.me/oauth2/v2.1/authorize?state=fake');f.visible();assert.match(status(f),/完了をまだ確認できません/);f.update('同一エラー');f.check();f.click();await f.reply('https://access.line.me/oauth2/v2.1/authorize?state=fake');f.update('同一エラー');assert.equal(status(f),'同一エラー');f.visible();assert.equal(status(f),'同一エラー');console.log('PASS repeated identical server error stays visible');
