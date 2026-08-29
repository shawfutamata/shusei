// 画像の縮小は投稿する人の端末で済ませる。サーバーでは変換しない。
// Workersの計算時間は従量で、R2の保存も転送も画像が小さいほど安いため。

/** 長辺を maxEdge に収めたJPEGにする。縮まないときは元のまま返す。 */
export async function shrinkImage(file: File, maxEdge: number, quality: number) {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    // 縮小して大きくなるなら意味がないので、そのときだけ元を使う。
    if (scale === 1 && blob.size >= file.size) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** 一覧に出す小さい版。1画面に何件も並ぶので、ここを小さく保つのが効く。 */
export const listThumbnail = (file: File) => shrinkImage(file, 480, 0.72);

/** 詳細で見る版。名刺の保存版と同じ大きさ。 */
export const detailImage = (file: File) => shrinkImage(file, 1400, 0.8);
