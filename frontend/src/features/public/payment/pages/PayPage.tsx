'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import PaymentStatus from '../components/PaymentStatus';

export default function PayPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const total = Number(searchParams.get('total') ?? 0);
  const packageId = Number(searchParams.get('packageId') ?? 0);

  const handleSuccess = () => {
    router.push('/instruction');
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <PaymentStatus
        total={total}
        packageId={packageId}
        onRetry={() => router.back()}
        onSuccess={handleSuccess}
      />
    </main>
  );
}
