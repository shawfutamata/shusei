// 動画の圧縮も、写真と同じく**投稿する人の端末でやる**。
// Workersの計算時間は従量で、R2の保存も転送も小さいほど安い。
// 会員が撮ったままの動画は1分で100MBを超えることもあり、そのまま送らせると
// 通信量でも保存量でも持たない。
//
// やり方は「再生しながらcanvasへ描き、MediaRecorderで録り直す」。
// WebCodecsのほうが速いが、iOS Safariで安定しないため、どの端末でも
// 動くこちらを採る。実時間かかるので、進み具合を必ず画面に出すこと。

export const VIDEO_MAX_SECONDS = 30;
/** 圧縮しても これを超えるなら諦めてもらう。R2の無料枠（10GB）を守るための線。 */
export const VIDEO_MAX_BYTES = 12 * 1024 * 1024;
/** 長辺。720pあれば現場や商品は十分に伝わる。 */
const MAX_EDGE = 1280;
const BITS_PER_SECOND = 1_200_000;

export type VideoCompressResult =
  | { ok: true; file: File; seconds: number }
  | { ok: false; error: string };

/** その端末で録り直しができるか。できなければ圧縮せずに送るしかない。 */
export function canCompressVideo() {
  return typeof MediaRecorder !== 'undefined'
    && typeof HTMLCanvasElement.prototype.captureStream === 'function';
}

function pickMimeType() {
  // iOSはmp4、他はwebmが通りやすい。使える最初のものを選ぶ。
  const candidates = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
}

/**
 * 長さを読む。
 *
 * 端末で撮ったばかりの動画や、ブラウザが録った動画は、メタデータに長さが
 * 入っていないことがある（duration が Infinity になる）。そのときは、
 * いったん終端まで飛ばすと入る。これをやらないと「読み込めません」になる。
 */
async function readDuration(video: HTMLVideoElement) {
  if (Number.isFinite(video.duration) && video.duration > 0) return video.duration;
  return new Promise<number>((resolve) => {
    const give = () => resolve(Number.isFinite(video.duration) ? video.duration : 0);
    const timer = window.setTimeout(give, 3000);
    video.onseeked = () => { window.clearTimeout(timer); video.currentTime = 0; give(); };
    // 十分に大きい値を入れると、ブラウザが終端へ寄せて長さを確定させる。
    video.currentTime = 1e9;
  });
}

/**
 * 動画を720p・約1.2Mbpsで録り直す。
 * onProgress は 0〜1。実時間かかるので、呼び出し側で必ず出すこと。
 */
export async function compressVideo(file: File, onProgress?: (ratio: number) => void): Promise<VideoCompressResult> {
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  const sourceUrl = URL.createObjectURL(file);
  video.src = sourceUrl;

  try {
    await new Promise<void>((resolve, reject) => {
      video.onloadedmetadata = () => resolve();
      video.onerror = () => reject(new Error('この動画は読み込めませんでした。'));
    });

    const seconds = await readDuration(video);
    if (!Number.isFinite(seconds) || seconds <= 0) return { ok: false, error: 'この動画は読み込めませんでした。' };
    if (seconds > VIDEO_MAX_SECONDS + 0.5) {
      return { ok: false, error: `動画は${VIDEO_MAX_SECONDS}秒までです。短く切ってからお選びください。` };
    }
    // 録り直せない端末では、小さければそのまま通す。
    if (!canCompressVideo()) {
      return file.size <= VIDEO_MAX_BYTES
        ? { ok: true, file, seconds }
        : { ok: false, error: 'この端末では動画を小さくできません。別の端末からお試しください。' };
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement('canvas');
    // 幅と高さは偶数にする。奇数だとエンコーダが受け付けないことがある。
    canvas.width = Math.round(video.videoWidth * scale / 2) * 2;
    canvas.height = Math.round(video.videoHeight * scale / 2) * 2;
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, error: '動画を小さくできませんでした。' };

    const mimeType = pickMimeType();
    const stream = canvas.captureStream(30);
    const recorder = new MediaRecorder(stream, mimeType
      ? { mimeType, videoBitsPerSecond: BITS_PER_SECOND }
      : { videoBitsPerSecond: BITS_PER_SECOND });
    const chunks: BlobPart[] = [];
    recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    const stopped = new Promise<void>((resolve) => { recorder.onstop = () => resolve(); });

    // 先頭に戻してから録り始める。長さを読むために終端へ飛ばしているため。
    if (video.currentTime > 0) {
      await new Promise<void>((resolve) => {
        const timer = window.setTimeout(resolve, 1500);
        video.onseeked = () => { window.clearTimeout(timer); resolve(); };
        video.currentTime = 0;
      });
    }

    recorder.start(250);
    await video.play();

    // 描き写しはフレームごとに。requestVideoFrameCallback があるほうが取りこぼしが少ない。
    // 無ければ requestAnimationFrame。画面を離れると止まるので、下の見張りで拾う。
    let finished = false;
    const finish = () => { finished = true; };
    video.onended = finish;

    const paint = () => {
      if (finished) return;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      onProgress?.(Math.min(0.99, video.currentTime / seconds));
      if (video.currentTime >= seconds - 0.05) return finish();
      next();
    };
    type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (cb: () => void) => number };
    const withFrameCallback = video as FrameVideo;
    const next = () => {
      if (typeof withFrameCallback.requestVideoFrameCallback === 'function') withFrameCallback.requestVideoFrameCallback(paint);
      else requestAnimationFrame(paint);
    };
    next();

    // 見張り。実時間の3倍かかったら諦める。ここが無いと、画面を離れた人が
    // 「小さくしています」のまま永遠に戻ってこられなくなる。
    const limitMs = seconds * 3000 + 10000;
    const startedAt = Date.now();
    await new Promise<void>((resolve) => {
      const watch = window.setInterval(() => {
        if (finished || video.ended || Date.now() - startedAt > limitMs) {
          finished = true;
          window.clearInterval(watch);
          resolve();
        }
      }, 200);
    });

    video.pause();
    recorder.stop();
    stream.getTracks().forEach((track) => track.stop());
    await stopped;
    onProgress?.(1);

    const type = mimeType.split(';')[0] || 'video/webm';
    const blob = new Blob(chunks, { type });
    if (!blob.size) return { ok: false, error: '動画を小さくできませんでした。' };
    // 縮めたのに元より大きいなら、元のほうを使う。
    const best = blob.size < file.size ? new File([blob], `${file.name.replace(/\.[^.]+$/, '')}.${type.includes('mp4') ? 'mp4' : 'webm'}`, { type }) : file;
    if (best.size > VIDEO_MAX_BYTES) {
      return { ok: false, error: `小さくしても${Math.round(best.size / 1024 / 1024)}MBありました。もう少し短い動画をお選びください。` };
    }
    return { ok: true, file: best, seconds };
  } catch {
    return { ok: false, error: '動画を小さくできませんでした。' };
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
