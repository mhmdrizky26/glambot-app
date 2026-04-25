'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useCreatePayment } from '../api/createPayment';
import { getPaymentStatus } from '../api/getPaymentStatus';

export type PaymentState =
  | 'waiting'
  | 'processing'
  | 'success'
  | 'failed'
  | 'expired';

const TIMEOUT_SECONDS = 300;
const POLL_INTERVAL_MS = 3000;
const PROCESSING_DELAY_MS = 2500;
const SUCCESS_REDIRECT_DELAY_MS = 3000;

interface UsePaymentOptions {
  sessionId: string;
  onSuccess?: (sessionId: string) => void;
}

interface UsePaymentReturn {
  status: PaymentState;
  qrisUrl: string | null;
  timeLeft: number;
  formattedTime: string;
  retry: () => void;
  triggerStatus: (state: PaymentState) => void;
}

export function usePayment({
  sessionId,
  onSuccess,
}: UsePaymentOptions): UsePaymentReturn {
  const [status, setStatus] = useState<PaymentState>('waiting');
  const [qrisUrl, setQrisUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_SECONDS);
  const [midtransOrderId, setMidtransOrderId] = useState<string | null>(null);
  const [pollingEnabled, setPollingEnabled] = useState(false);

  const redirectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const processingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const formatTime = useCallback((seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  }, []);

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

  // Create payment mutation
  const { mutate: initiatePayment } = useCreatePayment({
    mutationConfig: {
      onSuccess: (result) => {
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
    setTimeLeft(TIMEOUT_SECONDS);
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
  }, [polledStatus, cleanup, onSuccess, sessionId]);

  const retry = useCallback(() => {
    initPayment();
  }, [initPayment]);

  const triggerStatus = useCallback(
    (state: PaymentState) => {
      cleanup();
      if (state === 'processing') {
        setStatus('processing');
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
    [cleanup, onSuccess, sessionId],
  );

  return {
    status,
    qrisUrl,
    timeLeft,
    formattedTime: formatTime(timeLeft),
    retry,
    triggerStatus,
  };
}
