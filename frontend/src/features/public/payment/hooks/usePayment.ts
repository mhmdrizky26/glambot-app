'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPayment, checkPaymentStatus } from '../api/paymentApi';
import type { PaymentStatusResult } from '../api/paymentApi';

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
  total: number;
  onSuccess?: () => void;
}

interface UsePaymentReturn {
  status: PaymentState;
  qrisUrl: string | null;
  timeLeft: number;
  formattedTime: string;
  total: number;
  retry: () => void;
  triggerStatus: (state: PaymentState) => void;
}

export function usePayment({
  total,
  onSuccess,
}: UsePaymentOptions): UsePaymentReturn {
  const [status, setStatus] = useState<PaymentState>('waiting');
  const [qrisUrl, setQrisUrl] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(TIMEOUT_SECONDS);
  const transactionIdRef = useRef<string | null>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
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
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (redirectTimeoutRef.current) {
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, []);

  const initPayment = useCallback(async () => {
    cleanup();
    setStatus('waiting');
    setQrisUrl(null);
    setTimeLeft(TIMEOUT_SECONDS);
    transactionIdRef.current = null;

    try {
      const result = await createPayment(total);
      transactionIdRef.current = result.transactionId;
      setQrisUrl(result.qrisUrl);
    } catch {
      setStatus('failed');
    }
  }, [total, cleanup]);

  // Init payment on mount
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    initPayment();
    return cleanup;
  }, [initPayment, cleanup]);

  // Countdown timer — disabled for now
  // useEffect(() => {
  //   if (status !== "waiting") return;
  //   timerRef.current = setInterval(() => {
  //     setTimeLeft((prev) => {
  //       if (prev <= 1) { setStatus("expired"); return 0; }
  //       return prev - 1;
  //     });
  //   }, 1000);
  //   return () => {
  //     if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  //   };
  // }, [status]);

  // Polling — only when "waiting"
  useEffect(() => {
    if (status !== 'waiting') return;
    if (!transactionIdRef.current) return;

    const poll = async () => {
      if (!transactionIdRef.current) return;

      try {
        const result: PaymentStatusResult = await checkPaymentStatus(
          transactionIdRef.current,
        );

        if (result === 'success') {
          // Stop polling & timer, show processing first
          if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
          }
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }

          setStatus('processing');

          // After processing delay, show success
          processingTimeoutRef.current = setTimeout(() => {
            setStatus('success');

            // Auto-redirect after showing success
            redirectTimeoutRef.current = setTimeout(() => {
              onSuccess?.();
            }, SUCCESS_REDIRECT_DELAY_MS);
          }, PROCESSING_DELAY_MS);
        } else if (result === 'failed') {
          cleanup();
          setStatus('processing');

          processingTimeoutRef.current = setTimeout(() => {
            setStatus('failed');
          }, PROCESSING_DELAY_MS);
        }
      } catch {
        // Silently retry on next poll
      }
    };

    pollingRef.current = setInterval(poll, POLL_INTERVAL_MS);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [status, cleanup, onSuccess]);

  const retry = useCallback(() => {
    initPayment();
  }, [initPayment]);

  // Manual trigger for dev/testing — switch to any state
  const triggerStatus = useCallback(
    (state: PaymentState) => {
      cleanup();

      if (state === 'processing') {
        setStatus('processing');
        processingTimeoutRef.current = setTimeout(() => {
          setStatus('success');
          redirectTimeoutRef.current = setTimeout(() => {
            onSuccess?.();
          }, SUCCESS_REDIRECT_DELAY_MS);
        }, PROCESSING_DELAY_MS);
      } else {
        setStatus(state);
        if (state === 'success') {
          redirectTimeoutRef.current = setTimeout(() => {
            onSuccess?.();
          }, SUCCESS_REDIRECT_DELAY_MS);
        }
      }
    },
    [cleanup, onSuccess],
  );

  return {
    status,
    qrisUrl,
    timeLeft,
    formattedTime: formatTime(timeLeft),
    total,
    retry,
    triggerStatus,
  };
}
