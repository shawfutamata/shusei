// ガチャの画面が受け取る形。**サーバーが返すものだけ**をここに書く。
// 当たりの決め方や重みは持たない（app/gacha.ts と db/data.ts にある）。
export type GachaView = {
  key: string;
  name: string;
  period: string;
  open: boolean;
  drawn: boolean;
  prize: { key: string; label: string; days: number; note: string } | null;
  giftDays: number;
  giftExpiresOn: string;
  prizes: { key: string; label: string; days: number }[];
};
