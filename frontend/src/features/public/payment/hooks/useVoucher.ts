'use client';

import { useState } from 'react';
import { useValidateVoucher } from '../api/validateVoucher';

export function useVoucher() {
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);

  const { isPending: loading, mutate } = useValidateVoucher({
    mutationConfig: {
      onSuccess: (result) => {
        setDiscount(result.discount);
        setIsValid(result.valid);
        setMessage(result.message);
      },
      onError: () => {
        setMessage('Failed to validate voucher');
        setIsValid(false);
        setDiscount(0);
      },
    },
  });

  const applyVoucher = () => {
    if (!code.trim()) return;
    setMessage(null);
    mutate({ code });
  };

  const resetVoucher = () => {
    setCode('');
    setDiscount(0);
    setMessage(null);
    setIsValid(false);
  };

  return {
    code,
    setCode,
    discount,
    message,
    isValid,
    loading,
    applyVoucher,
    resetVoucher,
  };
}
