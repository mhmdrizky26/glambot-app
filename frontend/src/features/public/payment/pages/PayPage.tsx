'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import PaymentStatus from '../components/PaymentStatus';
import Timer from '@/components/shared/Timer';

export default function PayPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  if (!sessionId) return null;

  const handleSuccess = (sid: string) => {
    router.push(`/instruction?sessionId=${sid}`);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-full px-4">
      <Timer />
      <PaymentStatus
        sessionId={sessionId}
        onRetry={() => router.back()}
        onSuccess={handleSuccess}
      />
    </main>
  );
}
