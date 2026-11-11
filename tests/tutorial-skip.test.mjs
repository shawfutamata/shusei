// DOMが使えない環境でも実コンポーネントの全ステップと保存処理を確認する。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const state=[];let cursor=0;const storage=new Map([['user-data','preserved']]);
globalThis.window={innerWidth:390,innerHeight:740,localStorage:{getItem:k=>storage.get(k),setItem:(k,v)=>storage.set(k,v)}};
globalThis.__tutorialHooks={state,cursor:()=>cursor++,createElement:(type,props,...children)=>({type,props:props||{},children})};
const result=await build({entryPoints:['app/Tutorial.tsx'],bundle:true,write:false,format:'esm',tsconfigRaw:{compilerOptions:{jsx:'react'}},jsx:'transform',jsxFactory:'globalThis.__tutorialHooks.createElement',plugins:[{name:'react-test-hooks',setup(b){b.onResolve({filter:/^react$/},()=>({path:'react',namespace:'stub'}));b.onLoad({filter:/.*/,namespace:'stub'},()=>({contents:`const h=globalThis.__tutorialHooks;export const useCallback=f=>f,useEffect=()=>{},useRef=()=>({current:null});export function useState(initial){const i=h.cursor();if(!(i in h.state))h.state[i]=typeof initial==='function'?initial():initial;return[h.state[i],v=>h.state[i]=typeof v==='function'?v(h.state[i]):v]}`}));}}]});
const {default:Tutorial,tutorialSeen}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));
let closed=0,finished=0;const render=()=>{cursor=0;return Tutorial({onClose:()=>closed++,onFinish:()=>finished++})};
const find=(node,predicate)=>{if(!node||typeof node!=='object')return; if(predicate(node))return node;for(const child of (node.children||[]).flat(Infinity)){const found=find(child,predicate);if(found)return found}};
const button=(tree,label)=>find(tree,n=>n.type==='button'&&n.children.flat(Infinity).includes(label));
for(let step=0;step<5;step++){state[0]=step;const tree=render();assert.ok(button(tree,'ガイドをスキップ'));button(tree,'ガイドをスキップ').props.onClick();assert.equal(closed,step+1);assert.equal(finished,0);assert.ok(tutorialSeen());assert.equal(storage.get('user-data'),'preserved')}
state[0]=0;button(render(),'次へ').props.onClick();assert.equal(state[0],1);button(render(),'戻る').props.onClick();assert.equal(state[0],0);
state[0]=4;button(render(),'ガイドを完了する').props.onClick();assert.equal(finished,1);
state[0]=0;const card=find(render(),n=>n.type==='section');assert.equal(card.props.style.top,370);
window.localStorage.setItem=()=>{throw Error('denied')};button(render(),'ガイドをスキップ').props.onClick();assert.equal(closed,6);
console.log('PASS all five skip handlers; seen flag; unrelated storage; back/next/finish; centered fallback; denied storage. Browser layout not covered.');
