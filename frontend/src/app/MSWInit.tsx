'use client';

import { useEffect } from 'react';
import { initializeMocks } from '@/testing/mocks/initialize';

export function MSWInit() {
  useEffect(() => {
    initializeMocks();
  }, []);

  return null;
}
