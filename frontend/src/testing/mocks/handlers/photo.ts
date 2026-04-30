import { http, HttpResponse } from 'msw';
import { networkDelay } from '../utils';

export const photoHandlers = [
  // Get photos from a photo session
  http.get('/api/photo-session/:sessionId/photos', async ({ params }) => {
    console.log('[MSW] Photo handler called with sessionId:', params);
    await networkDelay();

    const { sessionId } = params as { sessionId: string };

    // Random count between 6 and 12
    const photoCount = Math.floor(Math.random() * 7) + 6;

    const photos = Array.from({ length: photoCount }, (_, i) => {
      const seed = `${sessionId}-${i}`;
      const width = 600;
      const height = 600;
      const thumbWidth = 200;
      const thumbHeight = 200;

      return {
        id: `photo-${sessionId}-${i}`,
        url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
        thumbnailUrl: `https://picsum.photos/seed/${seed}/${thumbWidth}/${thumbHeight}`,
        sessionId,
      };
    });

    console.log('[MSW] Returning photos:', photos.length);
    return HttpResponse.json(photos, { status: 200 });
  }),

];
