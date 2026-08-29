// 画像を持っていない人でもバナーを出せるように、見出しと会社名から1枚作る。
//
// 作るのは**端末の中だけ**。出来上がったJPEGを、画像を選んだときと同じ経路で
// 送る。サーバーでは画像を作らない（Workersの計算時間は従量なので、ここで
// 作業させない）。ホームのバナーと同じ3:2で描くので、見えたままが掲載される。

export type AdBannerTheme = {
  value: string;
  label: string;
  from: string;
  to: string;
  ink: string;
  sub: string;
  bar: string;
};

export const adBannerThemes: AdBannerTheme[] = [
  { value: 'navy', label: '紺', from: '#0b4a9e', to: '#1478d6', ink: '#ffffff', sub: '#cfe4ff', bar: '#f4501e' },
  { value: 'orange', label: '橙', from: '#c93d0e', to: '#f4501e', ink: '#ffffff', sub: '#ffe0d3', bar: '#ffffff' },
  { value: 'ink', label: '墨', from: '#161d2b', to: '#2c3a52', ink: '#ffffff', sub: '#b9c6da', bar: '#46c6fb' },
  { value: 'paper', label: '生成り', from: '#f7f2e8', to: '#ffffff', ink: '#1b2940', sub: '#6a7a92', bar: '#0b4a9e' },
];

const WIDTH = 1200;
const HEIGHT = 800;

/**
 * 見出しと会社名からバナーのJPEGを作る。
 * @returns 送信できるFile。canvasが使えない環境では null。
 */
export async function makeBannerFile(input: { title: string; company: string; name: string; theme: string }) {
  const canvas = drawBanner(input);
  if (!canvas) return null;
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86));
  if (!blob) return null;
  return new File([blob], 'banner.jpg', { type: 'image/jpeg' });
}

/** プレビュー用。画面に出すだけなのでデータURLで返す。 */
export function makeBannerPreview(input: { title: string; company: string; name: string; theme: string }) {
  const canvas = drawBanner(input);
  return canvas ? canvas.toDataURL('image/jpeg', 0.8) : '';
}

function drawBanner({ title, company, name, theme }: { title: string; company: string; name: string; theme: string }) {
  const look = adBannerThemes.find((entry) => entry.value === theme) ?? adBannerThemes[0];
  let canvas: HTMLCanvasElement;
  try {
    canvas = document.createElement('canvas');
  } catch {
    return null;
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const context = canvas.getContext('2d');
  if (!context) return null;

  const background = context.createLinearGradient(0, 0, WIDTH, HEIGHT);
  background.addColorStop(0, look.from);
  background.addColorStop(1, look.to);
  context.fillStyle = background;
  context.fillRect(0, 0, WIDTH, HEIGHT);

  // 帯と見出しは、掲載時に左上へ重なる「PR」の札を避けた高さから始める。
  // ここを詰めると、出来上がりで札に隠れてしまう。
  context.fillStyle = look.bar;
  context.fillRect(96, 186, 104, 10);

  const font = '"Zen Kaku Gothic New","Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif';
  const headline = title.trim() || 'こんな人を探しています';
  // 文字数に合わせて大きさを決める。長い見出しでも枠からはみ出させない。
  const size = headline.length <= 11 ? 88 : headline.length <= 18 ? 72 : 58;
  context.fillStyle = look.ink;
  context.font = `900 ${size}px ${font}`;
  context.textBaseline = 'top';
  const lines = wrap(context, headline, WIDTH - 192);
  const lineHeight = Math.round(size * 1.34);
  let y = 254;
  for (const line of lines.slice(0, 4)) {
    context.fillText(line, 96, y);
    y += lineHeight;
  }

  const footer = [company.trim(), name.trim()].filter(Boolean).join('　');
  if (footer) {
    context.fillStyle = look.sub;
    context.font = `700 34px ${font}`;
    context.fillText(footer, 96, HEIGHT - 112);
  }
  return canvas;
}

// 日本語は単語で切れないので、1文字ずつ幅を測って折り返す。
function wrap(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const character of text) {
    if (character === '\n') { lines.push(line); line = ''; continue; }
    const next = line + character;
    if (context.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = character;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}
