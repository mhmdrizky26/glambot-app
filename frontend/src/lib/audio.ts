import { resolveBaseUrl } from '@/lib/api-client';

const audioCache = new Map<string, HTMLAudioElement>();

/**
 * Play an audio file served from backend `/storage/audio/`.
 * Caches the Audio element across calls so repeated plays don't re-fetch.
 * Silently fails on autoplay block / missing file.
 */
export function playBackendAudio(filename: string): void {
  if (typeof window === 'undefined') return;
  const url = `${resolveBaseUrl()}/storage/audio/${filename}`;
  let audio = audioCache.get(filename);
  if (!audio) {
    audio = new Audio(url);
    audio.preload = 'auto';
    audioCache.set(filename, audio);
  }
  try {
    audio.currentTime = 0;
  } catch {
    /* ignore */
  }
  audio.play().catch(() => {
    /* autoplay blocked or load error — silent */
  });
}
