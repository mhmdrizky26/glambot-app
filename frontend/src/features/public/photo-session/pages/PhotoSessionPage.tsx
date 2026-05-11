'use client';

import { SessionHeader } from '../components/SessionHeader';
import { CameraPreview } from '../components/CameraPreview';
import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useGetSession } from '@/shared/api/session';
import { sendSessionBroadcast } from '../lib/broadcastChannel';
import { useLiveStream } from '../api/getLivePreview';

export function PhotoSessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  const { data: session } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  const [sessionTimeLeft, setSessionTimeLeft] = useState(60 * 10);
  const { streamUrl, hasError, handleStreamError, retryStream } =
    useLiveStream();

  // Session timer
  useEffect(() => {
    if (sessionTimeLeft <= 0) return;

    const timer = setInterval(() => {
      setSessionTimeLeft((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);

    return () => clearInterval(timer);
  }, [sessionTimeLeft]);

  useEffect(() => {
    if (sessionTimeLeft === 0 && sessionId) {
      sendSessionBroadcast({ type: 'SESSION_END', sessionId });

      const timeout = setTimeout(() => {
        const isPrint = session?.packageCode === 'vip';
        router.push(
          isPrint
            ? `/photo-editor?sessionId=${sessionId}`
            : `/session-end?sessionId=${sessionId}`,
        );
      }, 1000);

      return () => clearTimeout(timeout);
    }
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
              streamUrl={streamUrl}
              hasError={hasError}
              onError={handleStreamError}
              onRetry={retryStream}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
