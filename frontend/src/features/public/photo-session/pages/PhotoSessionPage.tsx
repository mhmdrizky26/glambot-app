'use client';

import { SessionHeader } from '../components/SessionHeader';
import { CameraPreview } from '../components/CameraPreview';
import { useState, useEffect, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useGetSession } from '@/shared/api/session';
import { sendSessionBroadcast } from '../lib/broadcastChannel';
import { useLiveStream } from '../api/getLivePreview';
import { apiClient } from '@/lib/api-client';
import { playBackendAudio } from '@/lib/audio';

export function PhotoSessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  // Play inisiasi.mp3 sekali saat halaman foto terbuka
  useEffect(() => {
    if (sessionId) playBackendAudio('inisiasi.mp3');
  }, [sessionId]);

  const { data: session } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  const [sessionTimeLeft, setSessionTimeLeft] = useState(60 * 10);
  // Pastikan blok "session end" (broadcast + disable robot + navigate) cuma
  // fire SEKALI walaupun effect re-run akibat dep `session` (dari useGetSession)
  // refresh/refetch saat sessionTimeLeft sudah 0.
  const endFiredRef = useRef(false);
  const {
    frameUrl,
    cameraType,
    mediaStream,
    hasError,
    errorMessage,
    handleStreamError,
    retryStream,
  } = useLiveStream();

  // Session timer
  useEffect(() => {
    if (sessionTimeLeft <= 0) return;

    const timer = setInterval(() => {
      setSessionTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionTimeLeft]);

  useEffect(() => {
    if (sessionTimeLeft !== 0 || !sessionId) return;
    if (endFiredRef.current) return;
    endFiredRef.current = true;

    sendSessionBroadcast({ type: 'SESSION_END', sessionId });

    // Sesi selesai → matikan robot
    apiClient.post('/api/robot/disable').catch((err) => {
      console.warn('[PhotoSession] robot/disable failed:', err);
    });

    const isPrint = session?.packageCode === 'vip';
    const target = isPrint
      ? `/photo-editor?sessionId=${sessionId}`
      : `/session-end?sessionId=${sessionId}`;

    const timeout = setTimeout(() => {
      // VIP: photo-editor dulu untuk pilih frame + foto, lalu session-end.
      // Digital: langsung session-end (tampil QR untuk scan di HP).
      router.push(target);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [sessionTimeLeft, sessionId, session, router]);

  if (!sessionId) return null;

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="p-6 shrink-0">
        <SessionHeader sessionTimeLeft={sessionTimeLeft} />
      </div>

      <main className="flex flex-1 min-h-0 px-6 pb-6 pt-0">
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0">
            Preview Camera
          </h2>
          <div className="flex-1 min-h-0">
            <CameraPreview
              frameUrl={frameUrl}
              cameraType={cameraType}
              mediaStream={mediaStream}
              sessionId={sessionId}
              hasError={hasError}
              errorMessage={errorMessage}
              onError={handleStreamError}
              onRetry={retryStream}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
