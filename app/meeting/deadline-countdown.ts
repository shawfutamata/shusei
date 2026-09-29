/** Use the deadline, rather than decrementing a counter, to recover after backgrounding. */
export function deadlineCountdown(closesAt:number,now:number,closed:boolean):string {
 if(closed)return '受付終了';
 if(!now)return '確認中…';
 const seconds=Math.max(0,Math.ceil((closesAt-now)/1000));
 if(!seconds)return '受付終了';
 const hours=Math.floor(seconds/3600);
 const minutes=Math.floor(seconds%3600/60);
 return `${String(hours).padStart(2,'0')}時間 ${String(minutes).padStart(2,'0')}分 ${String(seconds%60).padStart(2,'0')}秒`;
}
