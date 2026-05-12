import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { apiClient, resolveBaseUrl } from '@/lib/api-client';

export type CameraType = 'canon' | 'builtin' | null;

interface CameraStatus {
  connected: boolean;
  camera_name?: string;
  camera_type?: 'canon' | 'builtin' | string;
}

export const useLiveStream = () => {
  const [hasError, setHasError] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [cameraType, setCameraType] = useState<CameraType>(null);
  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [webcamError, setWebcamError] = useState<string | null>(null);
  const frameCountRef = useRef(0);

  const baseUrl = useMemo(() => resolveBaseUrl(), []);

  // Probe backend untuk tahu tipe kamera (Canon atau Builtin)
  useEffect(() => {
    let cancelled = false;

    apiClient
      .get<CameraStatus>('/api/robot/status')
      .then((res) => {
        if (cancelled) return;
        const type = res.data?.camera_type === 'builtin' ? 'builtin' : 'canon';
        setCameraType(type);
      })
      .catch(() => {
        if (cancelled) return;
        setCameraType('canon');
      });

    return () => {
      cancelled = true;
    };
  }, [retryCount]);

  // Saat builtin, request webcam laptop via browser
  useEffect(() => {
    if (cameraType !== 'builtin') return;

    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setWebcamError('Browser tidak mendukung akses kamera');
      return;
    }

    let active = true;
    let localStream: MediaStream | null = null;

    navigator.mediaDevices
      .getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
      .then((stream) => {
        if (!active) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        localStream = stream;
        setMediaStream(stream);
        setWebcamError(null);
      })
      .catch((err: Error) => {
        if (!active) return;
        setWebcamError(err.message || 'Gagal membuka kamera laptop');
      });

    return () => {
      active = false;
      if (localStream) localStream.getTracks().forEach((t) => t.stop());
      setMediaStream(null);
    };
  }, [cameraType, retryCount]);

  // URL polling untuk Canon mode
  const frameUrl = useMemo(() => {
    if (cameraType !== 'canon') return null;
    if (hasError) return null;
    frameCountRef.current += 1;
    return `${baseUrl}/api/robot/liveview?t=${Date.now()}_${retryCount}_${frameCountRef.current}`;
  }, [cameraType, hasError, retryCount, baseUrl]);

  const handleStreamError = useCallback(() => {
    console.error('Gagal memuat live preview.');
    setHasError(true);
  }, []);

  const retryStream = useCallback(() => {
    setHasError(false);
    setWebcamError(null);
    setRetryCount((prev) => prev + 1);
  }, []);

  const errorMessage = webcamError ?? (hasError ? 'Stream tidak tersedia' : null);

  return {
    frameUrl,
    baseUrl,
    cameraType,
    mediaStream,
    hasError: hasError || !!webcamError,
    errorMessage,
    handleStreamError,
    retryStream,
  };
};
