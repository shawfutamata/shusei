// ガチャの画面が受け取る形。**サーバーが返すものだけ**をここに書く。
// 当たりの決め方や重みは持たない（app/gacha.ts と db/data.ts にある）。
import type { GachaTheme } from './gacha';

export type GachaView = {
  key: string;
  /** すべての回を通した期間。「12月20日〜1月7日」の形。 */
  period: string;
  /** 今日開いている回。期間外なら null。 */
  season: {
    key: string;
    name: string;
    theme: GachaTheme;
    action: string;
    emoji: string;
    lead: string;
    prizes: { key: string; label: string; days: number }[];
  } | null;
  drawnToday: boolean;
  prize: { key: string; label: string; days: number; note: string } | null;
  /** 連続で引いている日数。 */
  streak: number;
  /** この回でもらった日数の合計。 */
  wonDays: number;
  memberCapDays: number;
  giftDays: number;
  giftExpiresOn: string;
};
