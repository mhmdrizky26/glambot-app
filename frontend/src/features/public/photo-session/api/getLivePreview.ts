import { useState, useMemo, useCallback } from 'react';
import { resolveBaseUrl } from '@/lib/api-client';

export const useLiveStream = () => {
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const baseUrl = useMemo(() => resolveBaseUrl(), []);

  // Canon-only: live preview di-polling sebagai JPEG dari backend
  // (/api/robot/liveview, sumber digiCamControl). Tidak ada lagi mode webcam
  // laptop (builtin). Cache-buster cukup dari retryCount — CameraPreview
  // menambahkan timestamp-nya sendiri per frame saat polling.
  const frameUrl = useMemo(() => {
    if (hasError) return null;
    return `${baseUrl}/api/robot/liveview?retry=${retryCount}`;
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
