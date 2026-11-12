// 実TSXの状態遷移だけを検証。実ブラウザ・描画・LINE/メールは使用しない。
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { build } from 'esbuild';
const built=await build({entryPoints:['app/admin/line-test/LineTest.tsx'],bundle:true,write:false,format:'cjs',platform:'node',external:['react','next/link'],loader:{'.css':'empty','.module.css':'empty'},jsx:'transform',jsxFactory:'__ui.createElement',tsconfigRaw:{compilerOptions:{jsx:'react',paths:{'@/*':['./*']}}}});
const state=()=>({closed:false,linkedReady:true,slots:[{slot:1,status:'unused'},{slot:2,status:'unused'}]});
function all(node,predicate){if(!node||typeof node!=='object')return[];if(Array.isArray(node))return node.flatMap(n=>all(n,predicate));return[...(predicate(node)?[node]:[]),...(node.children||[]).flatMap(n=>all(n,predicate))];}
function text(node){if(node==null||typeof node==='boolean')return'';if(typeof node!=='object')return String(node);if(Array.isArray(node))return node.map(text).join('');return(node.children||[]).map(text).join('');}
function fixture(initial=state()){
 let cursor=0;const slots=[],requests=[];let tree;
 const loaded={exports:{}};
 const hooks={useState(value){const i=cursor++;if(!(i in slots))slots[i]=value;return[slots[i],v=>{slots[i]=typeof v==='function'?v(slots[i]):v;}];},useRef(value){const i=cursor++;if(!(i in slots))slots[i]={current:value};return slots[i];}};
 vm.runInNewContext(built.outputFiles[0].text,{module:loaded,exports:loaded.exports,require(name){if(name==='next/link')return 'a';assert.equal(name,'react');return hooks;},__ui:{createElement(type,props,...children){return{type,props:props||{},children};}},requestAnimationFrame(fn){fn();},fetch(url,options){assert.equal(url,'/api/admin/line-test');let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});requests.push({url,options,body:JSON.parse(options.body),resolve,reject});return promise;}});
 function render(){cursor=0;tree=loaded.exports.default({email:'owner@example.invalid',initialStatus:initial,friendUrl:'https://line.me/R/ti/p/@fixture',initialMessage:''});for(const n of all(tree,n=>n.props.ref))n.props.ref.current={focus(){}};return tree;}
 const nodes=p=>all(render(),p);const button=label=>{const n=nodes(n=>n.type==='button'&&text(n)===label);assert.equal(n.length,1,label);return n[0];};
 const check=()=>nodes(n=>n.type==='input'&&n.props.type==='checkbox').at(-1).props.onChange({target:{checked:true}});
 async function settle(){for(let i=0;i<8;i++)await Promise.resolve();render();}
 render();return{render,nodes,button,check,requests,async reply(i,data,ok=true){requests[i].resolve({ok,json:async()=>data});await settle();},async reject(i){requests[i].reject(new Error('fixture'));await settle();},text:()=>text(render())};
}
const send1='本人へテスト 1 を送る',send2='本人へテスト 2 を送る',close='残りの枠を閉じてテストを終了';
{
 const f=fixture({...state(),linkedReady:false});assert.equal(f.button('本人のLINEで連携する').props.disabled,true);const form=f.nodes(n=>n.type==='form')[0];assert.equal(form.props.action,'/api/auth/line/start');assert.equal(form.props.method,'post');assert.equal(f.nodes(n=>n.type==='input'&&n.props.name==='action')[0].props.value,'test_link');const consent=f.nodes(n=>n.type==='input'&&n.props.name==='consent')[0];assert.equal(consent.props.checked,false);assert.equal(consent.props.required,true);consent.props.onChange({target:{checked:true}});assert.equal(f.button('本人のLINEで連携する').props.disabled,false);f.check();assert.equal(f.button(send1).props.disabled,true,'link required');
}
{
 const f=fixture();assert.equal(f.button(send1).props.disabled,true);f.check();const action=f.button(send1).props.onClick;action();action();assert.equal(f.requests.length,1,'rapid clicks only one request');assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].body)),{action:'send',slot:1,confirm:true});assert.equal(f.button(send2).props.disabled,true,'busy disables second slot');await f.reply(0,{...state(),slots:[{slot:1,status:'accepted'},{slot:2,status:'unused'}]});assert.equal(f.button(send1).props.disabled,true);assert.equal(f.button(send2).props.disabled,false);assert.match(f.text(),/LINE受付済み.*端末/);
 f.button(close).props.onClick();await f.reply(1,{...state(),closed:true,linkedReady:false,slots:[{slot:1,status:'accepted'},{slot:2,status:'unused'}]});assert.equal(f.button(send2).props.disabled,true);assert.equal(f.button(close).props.disabled,true);assert.match(f.text(),/送信済み通知は取り消せません/);
}
for(const mode of ['reject','error','malformed']){
 const f=fixture();f.check();f.button(send1).props.onClick();if(mode==='reject')await f.reject(0);else await f.reply(0,mode==='error'?{error:'fixture'}:{broken:true},mode!=='error');assert.equal(f.button(send1).props.disabled,true);assert.equal(f.button(send2).props.disabled,true);assert.equal(f.button(close).props.disabled,true);assert.match(f.text(),/同じ操作は繰り返さず/);assert.equal(f.requests.length,1);
}
for(const status of ['accepted','unknown','failed']){const f=fixture({...state(),slots:[{slot:1,status},{slot:2,status}]});f.check();assert.equal(f.button(send1).props.disabled,true);assert.equal(f.button(send2).props.disabled,true);}
console.log('PASS: owner-only TSX consent/link guards, fixed request, double-click lock, two-slot/busy/closed states, uncertain/malformed failure lock. Element tree only; no browser rendering or real communications.');
