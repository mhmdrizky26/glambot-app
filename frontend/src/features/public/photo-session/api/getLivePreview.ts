import { useState, useMemo, useCallback } from 'react';
import { resolveBaseUrl } from '@/lib/api-client';

export const useLiveStream = () => {
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const baseUrl = useMemo(() => resolveBaseUrl(), []);

  // Canon-only: preview memakai stream MJPEG backend (satu koneksi, ~10 fps)
  // alih-alih polling JPEG per frame. `retry` memaksa koneksi baru saat user
  // menekan "Try again"; CameraPreview menambah nonce-nya sendiri saat
  // reconnect otomatis.
  const frameUrl = useMemo(() => {
    if (hasError) return null;
    return `${baseUrl}/api/robot/liveview/stream?retry=${retryCount}`;
  }, [hasError, retryCount, baseUrl]);

  const handleStreamError = useCallback(() => {
    console.error('Failed to load live preview.');
    setHasError(true);
  }, []);

  const retryStream = useCallback(() => {
    setHasError(false);
    setRetryCount((prev) => prev + 1);
  }, []);

  const errorMessage = hasError ? 'Stream not available' : null;

  return {
    frameUrl,
    baseUrl,
    hasError,
    errorMessage,
    handleStreamError,
    retryStream,
  };
};
