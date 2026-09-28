'use client';
import { useState } from 'react';
import { guessColumns, parseDelimited, profileFields, rosterLabels, validateRoster } from '@/app/meeting/roster';
import type { RosterPerson } from '@/app/meeting/types';
type Profile=Omit<RosterPerson,'id'>;
export default function RosterImport({busy,onImport}:{busy:boolean;onImport:(people:Profile[])=>Promise<void>}) {
  const [rows,setRows]=useState<string[][]>([]),[columns,setColumns]=useState(guessColumns([])),[error,setError]=useState(''),[consent,setConsent]=useState(false),[reading,setReading]=useState(false);
  function load(data:string[][]){if(data.length<2||data.length>101)throw new Error('見出し行と、1〜100人の名簿を選んでください。');setRows(data);setColumns(guessColumns(data[0]));setError('');setConsent(false);}
  async function file(file:File|undefined){if(!file)return;setReading(true);setRows([]);setConsent(false);setError('');try{
    if(file.size>2000000)throw new Error('ファイルは2MB以下にしてください。');
    if(/\.xlsx$/i.test(file.name)) {const {readSheet}=await import('read-excel-file/browser');load((await readSheet(file)).map(row=>row.map(cell=>cell===null?'':String(cell))).filter(row=>row.some(Boolean)));}
    else if(/\.(csv|tsv|txt)$/i.test(file.name)){const bytes=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(bytes);if(text.includes('\uFFFD'))text=new TextDecoder('shift-jis').decode(bytes);load(parseDelimited(text));}
    else throw new Error('Excel（.xlsx）またはCSVを選んでください。');
  }catch(e){setError(e instanceof Error?e.message:String(e));setRows([]);}finally{setReading(false);}}
  let profiles:Profile[]=[],validation='';
  if(rows.length){try{profiles=validateRoster(rows.slice(1).map(row=>Object.fromEntries(profileFields.map(key=>[key,columns[key]>=0?row[columns[key]]??'':'']))));}catch(e){validation=e instanceof Error?e.message:String(e);}}
  return <section className="meeting-import"><h3>本日の名簿を取り込む</h3><p>名簿から会社名・業種・事業内容を入力します。参加者が書くのは、つながりたい相手だけです。</p>
    <label>名簿ファイル<input type="file" accept=".xlsx,.csv,.tsv,.txt" disabled={busy||reading} onChange={e=>void file(e.target.files?.[0])}/></label>
    <p><a href="/meeting-roster-template.csv" download>名簿テンプレート（CSV）</a></p><p className="meeting-help">先頭行を見出しにしてください。氏名・会社名・業種は必須。事業内容・席番号・対応地域は、名簿にあれば取り込みます。電話・メールなどは取り込みません。</p>
    <details><summary>Excelからコピーして貼り付ける</summary><label>見出しを含めて貼り付け<textarea rows={4} placeholder={'氏名\t会社名\t業種\t事業内容'} onChange={e=>{try{load(parseDelimited(e.target.value));}catch(err){setError(String(err));setRows([]);}}}/></label></details>
    {reading&&<p role="status">名簿を読み込んでいます…</p>}{error&&<p role="alert" className="meeting-error">{error}</p>}
    {rows.length>0&&<><h4>名簿の列を確認</h4><div className="meeting-column-map">{profileFields.map(key=><label key={key}>{rosterLabels[key]}{['name','company','industry'].includes(key)?' *':''}<select value={columns[key]} disabled={busy} onChange={e=>setColumns({...columns,[key]:Number(e.target.value)})}><option value={-1}>取り込まない</option>{rows[0].map((h,i)=><option key={i} value={i}>{h||`列${i+1}`}</option>)}</select></label>)}</div>
      {validation?<p className="meeting-error" role="alert">{validation}</p>:<><p>{profiles.length}人を取り込みます。事業内容がない列は、業種の記載だけで判定します。</p><div className="meeting-roster-preview"><table><thead><tr><th>氏名 / 会社</th><th>業種 / 事業内容</th><th>席</th></tr></thead><tbody>{profiles.map((p,i)=><tr key={i}><td>{p.name}<br/>{p.company}</td><td>{p.industry}<br/>{p.services}</td><td>{p.table||'—'}</td></tr>)}</tbody></table></div>
      <label className="meeting-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)} disabled={busy}/><span>この名簿を当日のアンケートと紹介に利用する許可を確認しました。取り込み後は名簿を固定し、分析には回答・同意済みで出席確認できた方だけを使います。</span></label>
      <button disabled={busy||!consent} onClick={async()=>{setError('');try{await onImport(profiles);setRows([]);}catch(e){setError(String(e));}}}>この内容で名簿を取り込む</button></>}
    </>}
  </section>;
}
