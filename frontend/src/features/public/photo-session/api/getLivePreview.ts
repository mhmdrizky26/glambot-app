import { useState, useMemo, useCallback } from 'react';

export const useLiveStream = () => {
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);

  const streamUrl = useMemo(() => {
    if (hasError) return null;

    // Di dev/test pakai relative URL agar MSW bisa intercept
    // Di production pakai NEXT_PUBLIC_BACKEND_URL
    const baseUrl =
      process.env.NODE_ENV === 'production'
        ? (process.env.NEXT_PUBLIC_BACKEND_URL ?? 'http://localhost:8080')
        : '';

    const url = `${baseUrl}/api/robot/liveview/stream?t=${Date.now()}_${retryCount}`;
    return url;
  }, [hasError, retryCount]);

  const handleStreamError = useCallback(() => {
    console.error('Gagal memuat MJPEG stream.');
    setHasError(true);
  }, []);

  const retryStream = useCallback(() => {
    setHasError(false);
    setRetryCount((prev) => prev + 1);
  }, []);

  return {
    streamUrl,
    hasError,
    handleStreamError,
    retryStream,
  };
};
