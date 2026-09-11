// 画像の縮小は投稿する人の端末で済ませる。サーバーでは変換しない。
// Workersの計算時間は従量で、R2の保存も転送も画像が小さいほど安いため。

/**
 * 画像を1枚読む。まず createImageBitmap、だめなら <img> で読み直す。
 *
 * iPhoneの写真はHEICで届くことがある。Safariは <img> なら表示できるのに
 * createImageBitmap では読めないことがあるので、**2通り試してから諦める**。
 * ここで諦めると、送る側は「写真が選べない」としか分からない。
 */
export async function decodeImage(file: File): Promise<CanvasImageSource & { width: number; height: number }> {
  try {
    return await createImageBitmap(file);
  } catch {
    const source = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Image decode failed'));
        image.src = source;
      });
    } finally {
      URL.revokeObjectURL(source);
    }
  }
}

/** 長辺を maxEdge に収めたJPEGにする。縮まないときは元のまま返す。 */
export async function shrinkImage(file: File, maxEdge: number, quality: number) {
  try {
    const bitmap = await decodeImage(file);
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    if ('close' in bitmap) bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) return file;
    // 縮小して大きくなるなら意味がないので、そのときだけ元を使う。
    // ただし**JPEGでない写真は必ず焼き直す**。HEICのまま送ると受け取り側で弾かれる。
    if (scale === 1 && blob.size >= file.size && file.type === 'image/jpeg') return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' });
  } catch {
    return file;
  }
}

/** 一覧に出す小さい版。1画面に何件も並ぶので、ここを小さく保つのが効く。 */
export const listThumbnail = (file: File) => shrinkImage(file, 480, 0.72);

/** 詳細で見る版。拡大しても粗くならない大きさ。 */
export const detailImage = (file: File) => shrinkImage(file, 1400, 0.8);
