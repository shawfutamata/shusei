// トップバナーへの出稿枠。金額は app/plan-catalog.ts（Web専用）にある。
// この2つを分けているのは、画面（クライアント）から金額のファイルを
// 読まずに枠数やランク条件だけ使えるようにするため。

/** 同じ日に出せる広告の本数。これを超えると、その日は満枠。早い者勝ち。 */
export const AD_CONCURRENT_SLOTS = 10;

/** 1回の申し込みで選べる掲載日数の上限。ランクの特典で延びる。 */
export const AD_MAX_DAYS = 30;

/** 何日先まで申し込めるか。ランクの特典で先まで見えるようになる。 */
export const AD_DAYS_AHEAD = 60;

/** 出稿できるランクの下限。1=PEARL 2=EMERALD 3=SAPPHIRE 4=RUBY 5=DIAMOND */
export const AD_MIN_RANK_LEVEL = 4;

/** 見出しの上限。バナーに載るので短く。 */
export const AD_TITLE_MAX = 30;

/** 決済されないまま押さえている枠を解放するまでの時間（分）。 */
export const AD_RESERVATION_MINUTES = 60;
