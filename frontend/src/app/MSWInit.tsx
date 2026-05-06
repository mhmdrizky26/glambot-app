'use client';

import { useEffect, useState } from 'react';
import { initializeMocks } from '@/testing/mocks/initialize';

export function MSWInit({ children }: { children: React.ReactNode }) {
  const [mswReady, setMswReady] = useState(
    process.env.NEXT_PUBLIC_ENABLE_API_MOCKING !== 'true',
  );

  useEffect(() => {
    if (process.env.NEXT_PUBLIC_ENABLE_API_MOCKING !== 'true') return;

    initializeMocks().then(() => setMswReady(true));
  }, []);

  if (!mswReady) return null;

  return <>{children}</>;
}
