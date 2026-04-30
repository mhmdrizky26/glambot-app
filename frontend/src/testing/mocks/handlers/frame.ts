import { http, HttpResponse } from 'msw';
import { networkDelay } from '../utils';

const FRAMES = [
  {
    id: 'frame-164',
    name: 'Frame 1',
    imageUrl: '/frame/Frame 164.svg',
  },
  {
    id: 'frame-167',
    name: 'Frame 2',
    imageUrl: '/frame/Frame 167.svg',
  },
  {
    id: 'frame-165',
    name: 'Frame 3',
    imageUrl: '/frame/Frame 165.svg',
  },
];

export const frameHandlers = [
  // Get all available frames
  http.get('/api/frames', async () => {
    console.log('[MSW] Frame handler called');
    await networkDelay();
    return HttpResponse.json(FRAMES, { status: 200 });
  }),


];
