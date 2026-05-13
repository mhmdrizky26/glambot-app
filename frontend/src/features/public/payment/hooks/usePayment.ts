'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreatePayment } from '../api/createPayment';
import { getPaymentStatus } from '../api/getPaymentStatus';
import { usePatchSessionStatus } from '@/shared/api/session';

export type PaymentState =
  | 'waiting'
  | 'processing'
  | 'success'
  | 'failed'
  | 'expired';

const POLL_INTERVAL_MS = 3000;
const PROCESSING_DELAY_MS = 2500;
const SUCCESS_REDIRECT_DELAY_MS = 3000;

interface UsePaymentOptions {
  sessionId: string;
  onSuccess?: (sessionId: string) => void;
}

interface UsePaymentReturn {
  status: PaymentState;
  isPending: boolean;
  qrisUrl: string | null;
  totalPrice: number | null;
  retry: () => void;
  triggerStatus: (state: PaymentState) => void;
}

export function usePayment({
  sessionId,
  onSuccess,
}: UsePaymentOptions): UsePaymentReturn {
  const [status, setStatus] = useState<PaymentState>('waiting');
  const [qrisUrl, setQrisUrl] = useState<string | null>(null);
  const [totalPrice, setTotalPrice] = useState<number | null>(null);
  const [midtransOrderId, setMidtransOrderId] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);

  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const cleanup = useCallback(() => {
    setPollingEnabled(false);
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  // Update session status mutation
  const { mutate: updateSessionStatus } = usePatchSessionStatus();

  // Create payment mutation
  const { mutate: initiatePayment, isPending } = useCreatePayment({
    mutationConfig: {
      onSuccess: (result) => {
        const amount =
          result.session.finalPrice ?? result.transaction.amount ?? 0;
        setTotalPrice(amount);

        // Free voucher (finalPrice = 0): backend already returns the
        // transaction as 'paid' with no QRIS. Skip the QR flow and run the
        // same processing → success → redirect path as a paid QRIS payment.
        if (result.transaction.status === 'paid' || amount <= 0) {
          cleanup();
          setStatus('processing');
          updateSessionStatus({ sessionId, status: 'paid' });
          processingTimeoutRef.current = setTimeout(() => {
            setStatus('success');
            redirectTimeoutRef.current = setTimeout(() => {
              onSuccess?.(sessionId);
            }, SUCCESS_REDIRECT_DELAY_MS);
          }, PROCESSING_DELAY_MS);
          return;
        }

        if (!result.transaction.qrisUrl) {
          setStatus('failed');
          return;
        }
        setMidtransOrderId(result.transaction.midtransOrderId);
        setQrisUrl(result.transaction.qrisUrl);
        setPollingEnabled(true);
      },
      onError: () => {
        setStatus('failed');
      },
    },
  });

  const initPayment = useCallback(() => {
    cleanup();
    setStatus('waiting');
    setQrisUrl(null);
    setTotalPrice(null);
    setMidtransOrderId(null);
    initiatePayment({ sessionId });
  }, [sessionId, cleanup, initiatePayment]);

  // Init on mount
  useEffect(() => {
    initPayment();
    return cleanup;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll payment status
  const { data: polledStatus } = useQuery({
    queryKey: ['payment-status', midtransOrderId],
    queryFn: () => getPaymentStatus(midtransOrderId!),
    enabled: pollingEnabled && !!midtransOrderId && status === 'waiting',
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: 0,
  });

  useEffect(() => {
    if (!polledStatus) return;

    const result = polledStatus.status;

    if (result === 'paid') {
      cleanup();
      setStatus('processing');

      updateSessionStatus({ sessionId, status: 'paid' });

      processingTimeoutRef.current = setTimeout(() => {
        setStatus('success');
        redirectTimeoutRef.current = setTimeout(() => {
          onSuccess?.(sessionId);
        }, SUCCESS_REDIRECT_DELAY_MS);
      }, PROCESSING_DELAY_MS);
    } else if (result === 'failed' || result === 'expired') {
      cleanup();
      setStatus('processing');
      processingTimeoutRef.current = setTimeout(() => {
        setStatus(result === 'expired' ? 'expired' : 'failed');
      }, PROCESSING_DELAY_MS);
    }
  }, [polledStatus, cleanup, onSuccess, sessionId, updateSessionStatus]);

  const retry = useCallback(() => {
    initPayment();
  }, [initPayment]);

  const triggerStatus = useCallback(
    (state: PaymentState) => {
      cleanup();
      if (state === 'processing') {
        setStatus('processing');

        // Update session status to 'paid' when triggered
        updateSessionStatus({ sessionId, status: 'paid' });

        processingTimeoutRef.current = setTimeout(() => {
          setStatus('success');
          redirectTimeoutRef.current = setTimeout(() => {
            onSuccess?.(sessionId);
          }, SUCCESS_REDIRECT_DELAY_MS);
        }, PROCESSING_DELAY_MS);
      } else {
        setStatus(state);
        if (state === 'success') {
          redirectTimeoutRef.current = setTimeout(() => {
            onSuccess?.(sessionId);
          }, SUCCESS_REDIRECT_DELAY_MS);
        }
      }
    },
    [cleanup, onSuccess, sessionId, updateSessionStatus],
  );

  return {
    isPending,
    status,
    qrisUrl,
    totalPrice,
    retry,
    triggerStatus,
  };
}
