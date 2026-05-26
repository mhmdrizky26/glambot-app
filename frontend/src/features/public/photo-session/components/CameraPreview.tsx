import { useCallback, useEffect, useRef, useState } from 'react';
import { apiClient, resolveBaseUrl } from '@/lib/api-client';
import { playBackendAudio } from '@/lib/audio';
import type { CameraType } from '../api/getLivePreview';
import { useRobotConfig } from '../api/getRobotConfig';

interface CameraPreviewProps {
  frameUrl?: string | null;
  streamUrl?: string | null;
  cameraType?: CameraType;
  mediaStream?: MediaStream | null;
  sessionId?: string;
  onError?: () => void;
  onRetry?: () => void;
  hasError?: boolean;
  errorMessage?: string | null;
  className?: string;
}

export function CameraPreview({
  frameUrl,
  streamUrl,
  cameraType,
  mediaStream,
  sessionId,
  onError,
  onRetry,
  hasError = false,
  errorMessage,
  className,
}: CameraPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const frameCountRef = useRef(0);
  const pendingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRefs = useRef<Record<number, HTMLAudioElement>>({});
  const playedRef = useRef<Set<number>>(new Set());
  const wasActiveRef = useRef(false);
  const captureTriggeredRef = useRef(false);
  const prevPresetRef = useRef(0);
  // Set ke false di cleanup effect. Async callbacks (showLatestCanonCapture,
  // captureAndUpload) cek ref ini sebelum setState supaya tidak fire pada
  // komponen yang sudah unmount (mis. timer expire → navigate sementara
  // polling masih jalan).
  const isMountedRef = useRef(true);

  const [countdown, setCountdown] = useState<number | null>(null);
  const [capturedUrl, setCapturedUrl] = useState<string | null>(null);
  const capturedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const capturedBlobUrlRef = useRef<string | null>(null);

  const isBuiltin = cameraType === 'builtin';
  const displayUrl = frameUrl || streamUrl;
  const hasContent = isBuiltin ? !!mediaStream : !!displayUrl;

  // Show captured photo modal for 3s, then auto-hide.
  // Tracks blob URLs separately so we can revoke after hiding.
  const showCapturedModal = useCallback((url: string, isBlobUrl: boolean) => {
    if (capturedTimerRef.current) clearTimeout(capturedTimerRef.current);
    if (capturedBlobUrlRef.current && capturedBlobUrlRef.current !== url) {
      URL.revokeObjectURL(capturedBlobUrlRef.current);
      capturedBlobUrlRef.current = null;
    }
    setCapturedUrl(url);
    if (isBlobUrl) capturedBlobUrlRef.current = url;

    capturedTimerRef.current = setTimeout(() => {
      setCapturedUrl(null);
      if (capturedBlobUrlRef.current) {
        URL.revokeObjectURL(capturedBlobUrlRef.current);
        capturedBlobUrlRef.current = null;
      }
    }, 3000);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      if (capturedTimerRef.current) clearTimeout(capturedTimerRef.current);
      if (capturedBlobUrlRef.current) URL.revokeObjectURL(capturedBlobUrlRef.current);
    };
  }, []);

  // Preload countdown audio (3-2-1) from backend storage.
  // Cleanup: pause + clear src supaya audio buffer bisa di-GC dan tidak
  // ada handle yang menahan native resource saat komponen unmount.
  useEffect(() => {
    const base = resolveBaseUrl();
    audioRefs.current = {
      3: new Audio(`${base}/storage/audio/tiga.mp3`),
      2: new Audio(`${base}/storage/audio/dua.mp3`),
      1: new Audio(`${base}/storage/audio/satu.mp3`),
    };
    Object.values(audioRefs.current).forEach((a) => {
      a.preload = 'auto';
    });
    return () => {
      Object.values(audioRefs.current).forEach((a) => {
        try {
          a.pause();
          a.src = '';
          a.load();
        } catch {
          // ignore — audio element may already be disposed
        }
      });
      audioRefs.current = {};
    };
  }, []);

  // Capture from <video> (UNMIRRORED — natural orientation) and upload
  const captureAndUpload = useCallback(async () => {
    const video = videoRef.current;
    if (!video || !sessionId) return;

    const w = video.videoWidth || 1280;
    const h = video.videoHeight || 720;
    const captureCanvas = document.createElement('canvas');
    captureCanvas.width = w;
    captureCanvas.height = h;
    const ctx = captureCanvas.getContext('2d');
    if (!ctx) return;
    // Natural orientation (NOT mirrored) — preview is mirrored for UX,
    // but the saved photo should look "normal" from camera's POV.
    ctx.drawImage(video, 0, 0, w, h);

    const blob = await new Promise<Blob | null>((resolve) => {
      captureCanvas.toBlob((b) => resolve(b), 'image/jpeg', 0.92);
    });
    if (!blob) return;

    // Show preview modal immediately from local blob (instant, no waiting for upload)
    const previewUrl = URL.createObjectURL(blob);
    if (!isMountedRef.current) {
      URL.revokeObjectURL(previewUrl);
      return;
    }
    showCapturedModal(previewUrl, true);

    const formData = new FormData();
    formData.append('session_id', sessionId);
    formData.append('photo', blob, `webcam_${Date.now()}.jpg`);
    try {
      await apiClient.post('/api/photo/upload', formData);
    } catch (err) {
      console.error('[CameraPreview] Builtin upload failed:', err);
    }
  }, [sessionId, showCapturedModal]);

  // Canon path: after capture finishes, fetch most recent photo from backend
  // and show it in the modal. Backend writes photo to DB inside a goroutine,
  // so we may need to wait — retry with backoff until it appears.
  // Polling-loop ini bisa berjalan ~2.2 detik; user bisa navigate ke halaman
  // lain di tengah waktu itu (mis. sesi habis). isMountedRef.current jadi
  // false di unmount → kita break out tanpa setState (which would warn).
  const showLatestCanonCapture = useCallback(async () => {
    if (!sessionId) return;
    const triggeredAt = Date.now();
    // Attempts at 200, 400, 700, 1100, 1600, 2200 ms — total ~2.2s budget.
    const delays = [200, 200, 300, 400, 500, 600];
    for (let i = 0; i < delays.length; i++) {
      await new Promise((r) => setTimeout(r, delays[i]));
      if (!isMountedRef.current) return;
      try {
        const res = await apiClient.get<
          Array<{ url?: string; created_at?: string }>
        >(`/api/photo/session/${sessionId}`);
        if (!isMountedRef.current) return;
        const photos = res.data ?? [];
        if (photos.length === 0) continue;
        const sorted = [...photos].sort((a, b) => {
          const ta = a.created_at ? new Date(a.created_at).getTime() : 0;
          const tb = b.created_at ? new Date(b.created_at).getTime() : 0;
          return tb - ta;
        });
        const latest = sorted[0];
        const latestTs = latest?.created_at
          ? new Date(latest.created_at).getTime()
          : 0;
        // Only accept photos created at/after this capture trigger,
        // otherwise we might surface a leftover from the previous shot.
        // Allow a 1s clock-skew tolerance.
        if (!latest?.url || latestTs < triggeredAt - 1000) continue;
        const url = latest.url.startsWith('http')
          ? latest.url
          : `${resolveBaseUrl()}${latest.url}`;
        showCapturedModal(url, false);
        return;
      } catch (err) {
        if (!isMountedRef.current) return;
        console.error(
          '[CameraPreview] Failed to fetch latest canon capture (attempt ' +
            (i + 1) +
            '):',
          err,
        );
      }
    }
    console.warn('[CameraPreview] Canon capture not visible after retries');
  }, [sessionId, showCapturedModal]);

  // Robot state — di-share via React Query hook (single underlying poll
  // dengan PhotoSessionPage). Effect di bawah ini react ke perubahan state,
  // detect transisi (active → inactive) untuk fire capture, dan preset
  // change untuk preset-confirmation sound.
  const { data: robotConfig } = useRobotConfig();
  const active = robotConfig?.auto_capture_active === true;
  const remainingMs = robotConfig?.auto_capture_remaining_ms ?? 0;
  const currentPreset = robotConfig?.current_preset ?? 0;

  useEffect(() => {
    // Robot just started moving to a new preset (transition 0 → N or N → M)
    if (currentPreset > 0 && currentPreset !== prevPresetRef.current) {
      playBackendAudio('presetTerkonfirmasi.mp3');
    }
    prevPresetRef.current = currentPreset;
  }, [currentPreset]);

  useEffect(() => {
    if (active) {
      const seconds = Math.max(0, Math.ceil(remainingMs / 1000));
      if (seconds >= 1 && seconds <= 3) {
        setCountdown(seconds);
        if (!playedRef.current.has(seconds)) {
          playedRef.current.add(seconds);
          audioRefs.current[seconds]?.play().catch(() => {});
        }
      }
      wasActiveRef.current = true;
      captureTriggeredRef.current = false;
      return;
    }

    // active === false
    setCountdown(null);

    if (wasActiveRef.current && !captureTriggeredRef.current) {
      // Transition active → inactive = countdown just finished.
      captureTriggeredRef.current = true;
      if (isBuiltin) {
        captureAndUpload();
      } else {
        showLatestCanonCapture();
      }
    }

    wasActiveRef.current = false;
    playedRef.current.clear();
  }, [active, remainingMs, isBuiltin, captureAndUpload, showLatestCanonCapture]);

  // Builtin mode: render webcam via getUserMedia → <video> → canvas (mirrored)
  useEffect(() => {
    if (!isBuiltin || !mediaStream) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1280;
    canvas.height = 720;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const video = document.createElement('video');
    video.srcObject = mediaStream;
    video.muted = true;
    video.playsInline = true;
    videoRef.current = video;

    const render = () => {
      if (video.readyState >= 2) {
        // Mirror PREVIEW (selfie style). Capture uses a separate offscreen
        // canvas without scaling, so saved photos remain natural orientation.
        ctx.save();
        ctx.scale(-1, 1);
        ctx.drawImage(video, -canvas.width, 0, canvas.width, canvas.height);
        ctx.restore();
      }
      rafRef.current = requestAnimationFrame(render);
    };

    video
      .play()
      .then(() => {
        rafRef.current = requestAnimationFrame(render);
      })
      .catch(() => {});

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      video.srcObject = null;
      videoRef.current = null;
    };
  }, [isBuiltin, mediaStream]);

  // Canon mode: polling JPEG frames (backend already returns mirrored)
  useEffect(() => {
    if (isBuiltin) return;
    if (!displayUrl || hasError) {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = 1280;
    canvas.height = 720;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const loadFrame = () => {
      if (pendingRef.current) return;
      pendingRef.current = true;

      const baseUrl = displayUrl.split('?')[0];
      const url = `${baseUrl}?t=${Date.now()}_${++frameCountRef.current}`;

      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        pendingRef.current = false;
      };

      img.onerror = () => {
        pendingRef.current = false;
      };

      img.src = url;
    };

    loadFrame();
    frameIntervalRef.current = setInterval(loadFrame, 100);

    return () => {
      if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    };
  }, [isBuiltin, displayUrl, hasError]);

  const showError = hasError || (!isBuiltin && !displayUrl) || (isBuiltin && !mediaStream && hasError);
  void onError; // accepted for API compatibility

  return (
    <div
      className={`relative h-full w-full rounded-[28px] overflow-hidden bg-black ring-[6px] ring-primary ring-offset-2 ring-offset-transparent shadow-[0_20px_60px_-15px_rgba(63,114,175,0.45)] ${className ?? ''}`}
    >
      {/* Soft inner highlight for depth */}
      <div className="pointer-events-none absolute inset-0 z-10 rounded-[22px] ring-1 ring-inset ring-white/10" />
      {showError || !hasContent ? (
        <div className="w-full h-full flex flex-col items-center justify-center gap-3">
          <p className="text-white/40 text-sm">
            {errorMessage ?? 'Stream tidak tersedia'}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="text-xs text-primary/60 underline hover:text-primary"
            >
              Coba lagi
            </button>
          )}
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover"
          style={{ display: 'block' }}
        />
      )}

      {/* Countdown overlay (3, 2, 1) — centered, large, white */}
      {countdown !== null && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
          <span
            key={countdown}
            className="text-white font-bold animate-[countdownPop_900ms_ease-out_forwards]"
            style={{
              fontSize: 'min(45vw, 320px)',
              lineHeight: 1,
              textShadow:
                '0 0 30px rgba(0,0,0,0.7), 0 0 80px rgba(0,0,0,0.5), 0 6px 32px rgba(0,0,0,0.6)',
            }}
          >
            {countdown}
          </span>
        </div>
      )}

      {/* Capture result modal — fullscreen clean preview for 3s, then auto-hides.
          Blurred backdrop of the same image fills any aspect-ratio gap so the
          foreground photo stays uncropped and the screen never shows hard black. */}
      {capturedUrl && (
        <div className="fixed inset-0 z-50 overflow-hidden animate-[fadeIn_200ms_ease-out]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedUrl}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-50"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={capturedUrl}
            alt=""
            className="relative w-screen h-screen object-contain drop-shadow-2xl"
          />
        </div>
      )}

      {/* Corner brackets — refined: smaller, softer, brand-tinted */}
      <div className="absolute top-4 left-4 w-6 h-6 border-t border-l border-white/40 rounded-tl-md pointer-events-none z-10" />
      <div className="absolute top-4 right-4 w-6 h-6 border-t border-r border-white/40 rounded-tr-md pointer-events-none z-10" />
      <div className="absolute bottom-4 left-4 w-6 h-6 border-b border-l border-white/40 rounded-bl-md pointer-events-none z-10" />
      <div className="absolute bottom-4 right-4 w-6 h-6 border-b border-r border-white/40 rounded-br-md pointer-events-none z-10" />
    </div>
  );
}
