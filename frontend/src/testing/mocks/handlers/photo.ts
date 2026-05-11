import { http, HttpResponse } from 'msw';
import { networkDelay } from '../utils';

export const photoHandlers = [
  // POST /photo/compose - Compose frame with photo
  http.post('/api/photo/compose', async ({ request }) => {
    console.log('[MSW] Compose frame handler called');

    // Parse FormData
    const formData = await request.formData();
    const frameId = formData.get('frameId');
    const filter = formData.get('filter');
    const photoIds = formData.get('photoIds');
    const image = formData.get('image');

    console.log('[MSW] Composition data:', {
      frameId,
      filter,
      photoIds: photoIds ? JSON.parse(photoIds as string) : [],
      imageSize: image instanceof Blob ? image.size : 0,
    });

    // Simulate network delay (500-1000ms)
    await networkDelay();

    // Mock successful response
    return HttpResponse.json(
      {
        id: `comp-${Date.now()}`,
        frameId,
        filter,
        imageUrl: `/uploads/compositions/${Date.now()}.jpg`,
        createdAt: new Date().toISOString(),
      },
      { status: 201 },
    );
  }),

  // GET /photo/session/:sessionID - Get photos from a session
  http.get('/api/photo/session/:sessionID', async ({ params }) => {
    console.log(
      '[MSW] Get session photos handler called with sessionID:',
      params,
    );
    await networkDelay();

    const { sessionID } = params as { sessionID: string };

    // Random count between 6 and 12
    const photoCount = Math.floor(Math.random() * 7) + 6;

    const photos = Array.from({ length: photoCount }, (_, i) => {
      const seed = `${sessionID}-${i}`;
      const width = 600;
      const height = 600;
      const thumbWidth = 200;
      const thumbHeight = 200;

      return {
        id: `photo-${sessionID}-${i}`,
        url: `https://picsum.photos/seed/${seed}/${width}/${height}`,
        thumbnailUrl: `https://picsum.photos/seed/${seed}/${thumbWidth}/${thumbHeight}`,
        sessionId: sessionID,
        uploadedAt: new Date(
          Date.now() - Math.random() * 3600000,
        ).toISOString(),
      };
    });

    console.log('[MSW] Returning photos:', photos.length);
    return HttpResponse.json(photos, { status: 200 });
  }),
];
