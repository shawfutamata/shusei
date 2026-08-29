// トップバナーへの出稿枠。金額は app/plan-catalog.ts（Web専用）にある。
// この2つを分けているのは、画面（クライアント）から金額のファイルを
// 読まずに枠数やランク条件だけ使えるようにするため。

/** 1ヶ月あたりの枠数。早い者勝ちで埋まる。 */
export const AD_SLOTS_PER_MONTH = 10;

/** 出稿できるランクの下限。1=PEARL 2=EMERALD 3=SAPPHIRE 4=RUBY 5=DIAMOND */
export const AD_MIN_RANK_LEVEL = 4;

/** 見出しの上限。バナーに載るので短く。 */
export const AD_TITLE_MAX = 30;

/** 決済されないまま押さえている枠を解放するまでの時間（分）。 */
export const AD_RESERVATION_MINUTES = 60;
