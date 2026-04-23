'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import PaymentStatus from '../components/PaymentStatus';

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
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <PaymentStatus
        sessionId={sessionId}
        onRetry={() => router.back()}
        onSuccess={handleSuccess}
      />
    </main>
  );
}
