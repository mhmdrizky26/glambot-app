'use client';

import { useState } from 'react';
import { validateVoucher } from '../api/paymentApi';

export function useVoucher() {
  const [code, setCode] = useState('');
  const [discount, setDiscount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isValid, setIsValid] = useState(false);
  const [loading, setLoading] = useState(false);

  const applyVoucher = async () => {
    if (!code.trim()) return;

    setLoading(true);
    setMessage(null);

    try {
      const result = await validateVoucher(code);
      setDiscount(result.discount);
      setIsValid(result.valid);
      setMessage(result.message);
    } catch {
      setMessage('Failed to validate voucher');
      setIsValid(false);
      setDiscount(0);
    } finally {
      setLoading(false);
    }
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
