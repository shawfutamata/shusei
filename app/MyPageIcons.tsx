/**
 * マイページのタイルのアイコン。
 *
 * トンマナは業種アイコン（`public/icons/industries/`＝ICOOON MONO）に合わせる。
 * あちらは**線ではなく面で塗る**silhouette。角は丸く、抜きは穴（evenodd）で作り、
 * 白い図形を重ねない。下地の色が変わっても崩れないようにするため。
 *
 * 絵は自分で引いている。ICOOON MONO の作品をそのまま持ってきてはいない
 * （あちらは配布が許されていない。合わせているのは作り方であって、絵ではない）。
 * 大きさは 256 の枠。業種アイコンと同じ比率で、枠に対して大きめに取る。
 */

type Props = { className?: string };

function Icon({ children, className }: Props & { children: React.ReactNode }) {
  return <svg viewBox="0 0 256 256" className={className} fill="currentColor"
    aria-hidden="true" focusable="false">{children}</svg>;
}

/** オファー … 封筒。ふたのV字を穴で抜く。 */
export function OfferIcon(props: Props) {
  return <Icon {...props}>
    <path fillRule="evenodd" d="M40 52h176a24 24 0 0 1 24 24v104a24 24 0 0 1-24 24H40a24 24 0 0 1-24-24V76a24 24 0 0 1 24-24Zm4 30v22l84 62 84-62V82H44Z" />
  </Icon>;
}

/** 自分の投稿 … 角を折った紙。本文の行を穴で抜く。 */
export function PostsIcon(props: Props) {
  return <Icon {...props}>
    <path fillRule="evenodd" d="M64 16h88l64 64v144a24 24 0 0 1-24 24H64a24 24 0 0 1-24-24V40a24 24 0 0 1 24-24Zm88 22v50h50l-50-50ZM76 122h104v22H76v-22Zm0 44h104v22H76v-22Zm0 44h68v22H76v-22Z" />
  </Icon>;
}

/** プラン … 値札。穴を1つ開けて札だと分かるようにする。 */
export function PlanIcon(props: Props) {
  return <Icon {...props}>
    <path fillRule="evenodd" d="M140 20h76a20 20 0 0 1 20 20v76a20 20 0 0 1-5.9 14.1l-96 96a20 20 0 0 1-28.2 0l-76-76a20 20 0 0 1 0-28.2l96-96A20 20 0 0 1 140 20Zm52 34a20 20 0 1 0 0 40 20 20 0 0 0 0-40Z" />
  </Icon>;
}

/** 仲間を招待 … 人と＋。 */
export function InviteIcon(props: Props) {
  return <Icon {...props}>
    <path d="M96 24a46 46 0 1 1 0 92 46 46 0 0 1 0-92Z" />
    <path d="M96 130c-46 0-84 31-84 69v25h112v-19a86 86 0 0 1 22-58 130 130 0 0 0-50-17Z" />
    <path d="M182 148h28v30h30v28h-30v30h-28v-30h-30v-28h30v-30Z" />
  </Icon>;
}

/** 支払い履歴 … レシート。下をギザギザにして、明細の行を穴で抜く。 */
export function ReceiptIcon(props: Props) {
  return <Icon {...props}>
    <path fillRule="evenodd" d="M36 16h184v212l-23-15-23 15-23-15-23 15-23-15-23 15-23-15-23 15V16Zm32 46h120v24H68V62Zm0 56h120v24H68v-24Zm0 56h76v24H68v-24Z" />
  </Icon>;
}

/** プロフィール … 人の上半身。 */
export function ProfileIcon(props: Props) {
  return <Icon {...props}>
    <path d="M128 20a50 50 0 1 1 0 100 50 50 0 0 1 0-100Z" />
    <path d="M128 138c-54 0-98 36-98 80v18h196v-18c0-44-44-80-98-80Z" />
  </Icon>;
}

/** ご意見 … 吹き出し。中の行を穴で抜く。 */
export function VoiceIcon(props: Props) {
  return <Icon {...props}>
    <path fillRule="evenodd" d="M40 28h176a26 26 0 0 1 26 26v108a26 26 0 0 1-26 26h-90l-56 40v-40H40a26 26 0 0 1-26-26V54a26 26 0 0 1 26-26Zm28 46h120v24H68V74Zm0 52h84v24H68v-24Z" />
  </Icon>;
}
