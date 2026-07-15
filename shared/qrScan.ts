import jsQR from 'jsqr';

// QRカメラ読取の共通ロジック（screen.md 4.2 / architecture.md 第6章）。
// モバイル（Expo Web限定・src/screens/webConnect/QrCameraScanner.tsx）とWebダッシュボード
// （web/src/components/QrScanner.tsx）は、どちらも実ブラウザのDOM API（HTMLVideoElement /
// HTMLCanvasElement / MediaStream）上で動作する（前者はPlatform.OS==='web'でのみ描画される
// ため、両者に差はない）。video/canvas 要素の生成方法（JSXのref経由 or 命令的にDOM要素を
// 組み立てる）だけが異なり、カメラ起動〜jsQRデコードのループ自体は共通化できる。

export const QR_SCAN_VIDEO_CONSTRAINTS: MediaStreamConstraints = {
  video: { facingMode: 'environment' },
  audio: false,
};

const MSG_UNSUPPORTED = 'このブラウザはカメラ読取に対応していません。コードを貼り付けてください。';
const MSG_NOT_ALLOWED = 'カメラへのアクセスが許可されませんでした。コードを貼り付けてください。';
const MSG_START_FAILED = 'カメラを起動できませんでした。コードを貼り付けてください。';

// video/canvas は呼び出し側が用意した実体を渡す（JSXのref経由 or 命令的に生成した要素、
// いずれでもよい）。戻り値の stop() で起動中断・ループ停止・ストリーム停止を行う
// （呼び出し側のuseEffectのクリーンアップで呼ぶこと）。
export function runQrVideoScan(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  onDecode: (text: string) => void,
  onError: (message: string) => void,
): () => void {
  let cancelled = false;
  let stream: MediaStream | null = null;
  let frameHandle: number | null = null;
  let decoded = false;

  function scanFrame() {
    if (decoded || cancelled) return;
    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const result = jsQR(frame.data, frame.width, frame.height);
        if (result?.data) {
          decoded = true;
          onDecode(result.data);
          return;
        }
      }
    }
    frameHandle = requestAnimationFrame(scanFrame);
  }

  async function start() {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      onError(MSG_UNSUPPORTED);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia(QR_SCAN_VIDEO_CONSTRAINTS);
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
      if (cancelled) return;
      frameHandle = requestAnimationFrame(scanFrame);
    } catch (err) {
      if (cancelled) return;
      onError(
        err instanceof Error && err.name === 'NotAllowedError' ? MSG_NOT_ALLOWED : MSG_START_FAILED,
      );
    }
  }

  void start();

  return () => {
    cancelled = true;
    if (frameHandle !== null) cancelAnimationFrame(frameHandle);
    stream?.getTracks().forEach((t) => t.stop());
  };
}
