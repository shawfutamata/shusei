// hook本体の判定を実行。ブラウザの描画・ネイティブジェスチャーは別のruntimeテストで確認する。
import assert from 'node:assert/strict';
import { build } from 'esbuild';
const result=await build({entryPoints:['app/useBannerSwipe.ts'],bundle:true,write:false,format:'cjs',platform:'node',packages:'external'});
function fixture(){
 const changes=[],refs=[],states=[];
 const mock={useCallback:fn=>fn,useRef(value){const ref={current:value};refs.push(ref);return ref;},useState(value){const state={value};states.push(state);return [state.value,next=>{state.value=next;}];}};
 const loaded={exports:{}};new Function('require','module','exports',result.outputFiles[0].text)(()=>mock,loaded,loaded.exports);
 const {handlers}=loaded.exports.default(delta=>changes.push(delta));
 const captures=new Set();
 const wrapper={hasPointerCapture:id=>captures.has(id),setPointerCapture:id=>captures.add(id),releasePointerCapture:id=>captures.delete(id)};
 const event=(x=100,y=100,props={})=>({pointerId:1,pointerType:'touch',isPrimary:true,clientX:x,clientY:y,currentTarget:wrapper,target:wrapper,...props});
 const down=(x=100,y=100,props={})=>handlers.onPointerDown(event(x,y,props));
 const move=(x,y,props={})=>handlers.onPointerMove(event(x,y,props));
 const up=(x,y,props={})=>handlers.onPointerUp(event(x,y,props));
 function click(detail=1){let blocked=false;handlers.onClickCapture({detail,preventDefault(){blocked=true;},stopPropagation(){blocked=true;}});return blocked;}
 return {handlers,event,down,move,up,click,changes,interacting:()=>states[0].value,captures};
}
for(const [x,delta] of [[20,1],[180,-1]]) {
 const f=fixture();f.down();assert.equal(f.interacting(),true);f.move(x,102);assert.equal(f.captures.has(1),true);
 // ボタンからラッパーへcaptureが移った通知は、進行中のスワイプの中断ではない。
 f.handlers.onLostPointerCapture(f.event(x,102,{target:{}}));assert.equal(f.interacting(),true);
 f.up(x,102);assert.deepEqual(f.changes,[delta]);assert.equal(f.interacting(),false);assert.equal(f.click(),true);
 f.down();f.up(102,101);assert.equal(f.click(),false,'次の軽いタップは広告を開ける');
}
for(const [distance,expected] of [[39,[]],[40,[1]]]) {
 const f=fixture();f.down();f.move(100-distance,100);f.up(100-distance,100);assert.deepEqual(f.changes,expected);
}
for(const points of [[[80,100]],[[100,180],[20,180]],[[80,180]],[[20,100],[100,100]]]) {
 const f=fixture();f.down();for(const [x,y]of points)f.move(x,y);f.up(...points.at(-1));assert.deepEqual(f.changes,[]);assert.equal(f.click(),true);
}
{
 const f=fixture();f.down();f.move(20,100);f.handlers.onPointerCancel(f.event());f.up(20,100);assert.deepEqual(f.changes,[]);assert.equal(f.interacting(),false);assert.equal(f.click(),true);
 f.down();f.move(20,100);f.handlers.onLostPointerCapture(f.event());f.up(20,100);assert.deepEqual(f.changes,[]);assert.equal(f.interacting(),false);
}
{
 const f=fixture();f.down();f.move(20,100);f.down(120,120,{isPrimary:false,pointerId:2});f.up(20,100);assert.deepEqual(f.changes,[]);assert.equal(f.interacting(),false);
 f.down();f.move(20,100,{pointerId:2});f.up(20,100,{pointerId:2});assert.deepEqual(f.changes,[]);f.up(101,100);assert.equal(f.click(),false);
}
{
 const f=fixture();f.down(100,100,{pointerType:'mouse'});f.move(20,100,{pointerType:'mouse'});f.up(20,100,{pointerType:'mouse'});assert.deepEqual(f.changes,[]);assert.equal(f.click(),false);
 f.down();f.move(20,100);f.up(20,100);assert.equal(f.click(0),false,'キーボードからの操作は妨げない');
}
{
 const f=fixture();f.down();f.move(20,100);assert.equal(f.interacting(),true);f.handlers.ref(null);assert.equal(f.interacting(),false);f.up(20,100);assert.deepEqual(f.changes,[]);f.down();f.up(101,100);assert.equal(f.click(),false);
}
console.log('PASS hook: 左右、40px判定、指の揺れ、短い移動、縦/斜め/戻り、capture移動、取消、2本指、別pointer、次のタップ、マウス、キーボード');
