// ガチャの画面が受け取る形。**サーバーが返すものだけ**をここに書く。
// 当たりの決め方や重みは持たない（app/gacha.ts と db/data.ts にある）。
import type { GachaTheme } from './gacha';

export type GachaView = {
  key: string;
  /** 日本時間の今日。自動で開くのは1日1回にするための目印。 */
  today: string;
  /** 今日の回。見た目と当たりの名前はここで変わる。 */
  season: {
    key: string;
    name: string;
    theme: GachaTheme;
    action: string;
    /** ホームに置く横長のバナー（1200×400）。無ければ色と文字だけになる。 */
    image: string;
    /** 引くところに出すガチャ本体の絵（縦長）。動画の1枚目にもなる。 */
    machine: string;
    /** 回すときに流す動画（縦長・音なし）。無ければ絵のまま揺れる。 */
    video: string;
    lead: string;
    prizes: { key: string; tier: string; label: string; days: number }[];
  } | null;
  /** 次の季節の回。「12月20日からクリスマス」と先に知らせる。 */
  coming: { name: string; from: string } | null;
  drawnToday: boolean;
  /** 運営のアカウントか。何度でも回せる。 */
  master: boolean;
  /** その結果が「お試し」か。運営の2回目以降は記録も券も増えない。 */
  practice: boolean;
  prize: { key: string; tier: string; label: string; days: number; note: string } | null;
  /** 連続で引いている日数。 */
  streak: number;
  /** 今月もらった日数。 */
  monthDays: number;
  memberCapDaysPerMonth: number;
  giftDays: number;
  /** 手持ちの券のうち、いちばん早い期限。無ければ空。 */
  giftExpiresOn: string;
};
