'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useApplyVoucher } from '../api/validateVoucher';
import { getSessionQueryOptions } from '@/shared/api/session';

export function useVoucher(sessionId: string) {
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const queryClient = useQueryClient();

  const { isPending: loading, mutate } = useApplyVoucher({
    mutationConfig: {
      onSuccess: (result) => {
        setIsValid(result.valid);
        setMessage(result.message);

        // Invalidate session query to refresh data
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

  return { code, setCode, message, isValid, loading, applyVoucher };
}
