export const scheduleSource='https://colourjam.wixstudio.com/hirumeguro';
export type ScheduledMeeting={key:string;date:string;title:string;sourceId:string;startAt:number;prepareAt:number};
export function preparationTime(date:string){return Date.parse(date+'T01:00:00+09:00')-2*86400000;}
export function parseSchedule(html:string,now=Date.now()):ScheduledMeeting[]{
  // Read only the rendered schedule, not Wix's duplicate script/JSON data.
  html=html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,'');
  const tokens=[...html.matchAll(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]>|<a\b[^>]*href="(https:\/\/www\.shuseiclub\.jp\/hirunomeguro\/entry_form\/index\.php\?e=\d+)"[^>]*>/gi)];
  let year=0,month=0,date='',inSchedule=false;const found=new Map<string,ScheduledMeeting>();
  for(const token of tokens){
    if(token[1]){
      const text=token[1].replace(/<[^>]+>/g,'').normalize('NFKC').replace(/&nbsp;/g,' ').trim();
      const annual=text.match(/(20\d{2})年間スケジュール/);if(annual){year=Number(annual[1]);month=0;date='';inSchedule=true;continue;}
      if(!inSchedule)continue;
      if(/未定/.test(text)){date='';continue;}
      const day=text.match(/^(\d{1,2})月\s*(\d{1,2})日/);if(!day)continue;
      const nextMonth=Number(day[1]);if(month&&nextMonth<month)year++;month=nextMonth;
      date=`${year}-${String(month).padStart(2,'0')}-${day[2].padStart(2,'0')}`;
      const actual=new Date(date+'T00:00:00Z');if(actual.toISOString().slice(0,10)!==date)throw new Error('ホームページの開催日を確認してください。');
    }else if(date&&token[2]){
      const sourceId=new URL(token[2]).searchParams.get('e')!;
      const startAt=Date.parse(date+'T11:30:00+09:00');
      if(startAt>now)found.set(sourceId,{key:'hirunomeguro:'+sourceId,date,title:`ひるのめぐろ ${Number(date.slice(5,7))}月${Number(date.slice(8))}日例会`,sourceId,startAt,prepareAt:preparationTime(date)});
      date='';
    }
  }
  if(!found.size)throw new Error('ホームページから今後の開催日を確認できませんでした。自動作成を止めています。');
  return [...found.values()].sort((a,b)=>a.startAt-b.startAt);
}
