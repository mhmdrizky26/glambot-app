'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { usePatchSession, getSessionQueryOptions } from '@/shared/api/session';

export function useVoucher(sessionId: string) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const queryClient = useQueryClient();

  const { isPending: loading, mutate } = usePatchSession({
    mutationConfig: {
      onSuccess: (result) => {
        const applied = result.discount > 0;
        setIsValid(applied);
        setMessage(
          applied
            ? 'Voucher applied successfully'
            : 'Voucher code is invalid or inactive',
        );
        queryClient.invalidateQueries({
          queryKey: getSessionQueryOptions(sessionId).queryKey,
        });
      },
      onError: () => {
        setMessage('Failed to apply voucher');
        setIsValid(false);
      },
    },
  });

  const applyVoucher = () => {
    if (!code.trim() || !sessionId) return;
    setMessage(null);
    mutate({ sessionId, voucherCode: code });
  };

  const resetVoucher = () => {
    setCode('');
    setMessage(null);
    setIsValid(false);
  };

  return {
    code,
    setCode,
    message,
    isValid,
    loading,
    applyVoucher,
    resetVoucher,
  };
}
