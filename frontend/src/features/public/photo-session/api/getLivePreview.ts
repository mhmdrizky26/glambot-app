import { useState, useMemo, useCallback, useRef } from 'react';
import { resolveBaseUrl } from '@/lib/api-client';

export const useLiveStream = () => {
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const frameCountRef = useRef(0);

  const baseUrl = useMemo(() => resolveBaseUrl(), []);

  // Canon-only: live preview di-polling sebagai JPEG dari backend
  // (/api/robot/liveview, sumber digiCamControl). Tidak ada lagi mode webcam
  // laptop (builtin).
  const frameUrl = useMemo(() => {
    if (hasError) return null;
    frameCountRef.current += 1;
    return `${baseUrl}/api/robot/liveview?t=${Date.now()}_${retryCount}_${frameCountRef.current}`;
  }, [hasError, retryCount, baseUrl]);

  const handleStreamError = useCallback(() => {
    console.error('Gagal memuat live preview.');
    setHasError(true);
  }, []);

  const retryStream = useCallback(() => {
    setHasError(false);
    setRetryCount((prev) => prev + 1);
  }, []);

  const errorMessage = hasError ? 'Stream tidak tersedia' : null;

  return {
    frameUrl,
    baseUrl,
    hasError,
    errorMessage,
    handleStreamError,
    retryStream,
  };
};
