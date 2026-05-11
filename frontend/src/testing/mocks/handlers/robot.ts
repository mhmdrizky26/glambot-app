import { http } from 'msw';

const BOUNDARY = 'frame';
const FPS_INTERVAL_MS = 33; // ~30 FPS
const WIDTH = 640;
const HEIGHT = 480;

async function generateFrame(frameCounter: number): Promise<Uint8Array> {
  const canvas = new OffscreenCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext('2d')!;

  // Background hitam
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Kotak hijau bergerak
  const x = (frameCounter * 15) % WIDTH;
  const y = 200;
  ctx.fillStyle = '#00ff00';
  ctx.fillRect(x, y, 50, 50);

  const blob = await canvas.convertToBlob({
    type: 'image/jpeg',
    quality: 0.85,
  });
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Encode satu part MJPEG:
 * --frame\r\nContent-Type: image/jpeg\r\n\r\n<jpeg bytes>\r\n
 */
function encodePart(jpegBytes: Uint8Array): Uint8Array {
  const header = `--${BOUNDARY}\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpegBytes.byteLength}\r\n\r\n`;
  const footer = '\r\n';

  const headerBytes = new TextEncoder().encode(header);
  const footerBytes = new TextEncoder().encode(footer);

  const combined = new Uint8Array(
    headerBytes.byteLength + jpegBytes.byteLength + footerBytes.byteLength,
  );
  combined.set(headerBytes, 0);
  combined.set(jpegBytes, headerBytes.byteLength);
  combined.set(footerBytes, headerBytes.byteLength + jpegBytes.byteLength);

  return combined;
}

export const robotHandlers = [
  http.get('/api/robot/liveview/stream', ({ request }) => {
    let frameCounter = 0;
    let intervalId: ReturnType<typeof setInterval> | null = null;

    const stream = new ReadableStream({
      start(controller) {
        intervalId = setInterval(async () => {
          // Hentikan jika client disconnect
          if (request.signal.aborted) {
            if (intervalId) clearInterval(intervalId);
            controller.close();
            return;
          }

          try {
            frameCounter++;
            const jpegBytes = await generateFrame(frameCounter);
            const part = encodePart(jpegBytes);
            controller.enqueue(part);
          } catch {
            if (intervalId) clearInterval(intervalId);
            controller.close();
          }
        }, FPS_INTERVAL_MS);

        // Hentikan stream saat client disconnect
        request.signal.addEventListener('abort', () => {
          if (intervalId) clearInterval(intervalId);
          controller.close();
        });
      },
      cancel() {
        if (intervalId) clearInterval(intervalId);
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        'Content-Type': `multipart/x-mixed-replace; boundary=${BOUNDARY}`,
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
        Connection: 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }),
];
