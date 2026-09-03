// ガチャの画面が受け取る形。**サーバーが返すものだけ**をここに書く。
// 当たりの決め方や重みは持たない（app/gacha.ts と db/data.ts にある）。
import type { GachaTheme } from './gacha';

export type GachaView = {
  key: string;
  /** 今日の回。見た目と当たりの名前はここで変わる。 */
  season: {
    key: string;
    name: string;
    theme: GachaTheme;
    action: string;
    emoji: string;
    lead: string;
    prizes: { key: string; label: string; days: number }[];
  } | null;
  /** 次の季節の回。「12月20日からクリスマス」と先に知らせる。 */
  coming: { name: string; from: string } | null;
  drawnToday: boolean;
  prize: { key: string; label: string; days: number; note: string } | null;
  /** 連続で引いている日数。 */
  streak: number;
  /** 今月もらった日数。 */
  monthDays: number;
  memberCapDaysPerMonth: number;
  giftDays: number;
  /** 手持ちの券のうち、いちばん早い期限。無ければ空。 */
  giftExpiresOn: string;
};
