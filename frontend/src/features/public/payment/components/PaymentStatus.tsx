'use client';

import Image from 'next/image';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { usePayment } from '../hooks/usePayment';
import { StatusAnimation } from '@/components/shared/StatusAnimation';

interface PaymentStatusProps {
  sessionId: string;
  onRetry: () => void;
  onSuccess?: (sessionId: string) => void;
}

export default function PaymentStatus({
  sessionId,
  onRetry,
  onSuccess,
}: PaymentStatusProps) {
  const { status, qrisUrl, triggerStatus } = usePayment({
    sessionId,
    onSuccess,
  });

  // Processing state — user has paid, verifying payment
  if (status === 'processing') {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-125">
        <StatusAnimation status="processing" />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          Processing payment...
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          Please wait a moment
        </p>
      </div>
    );
  }

  // Success state
  if (status === 'success') {
    return (
      <div className="p-10 flex flex-col items-center text-center">
        <StatusAnimation status="success" />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          Payment Successful!
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          Let&apos;s begin your session!
        </p>
      </div>
    );
  }

  // Failed / Expired state
  if (status === 'failed' || status === 'expired') {
    return (
      <div className="p-10 flex flex-col items-center text-center">
        <StatusAnimation status={status} />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          {status === 'expired' ? 'Payment Expired!' : 'Payment Failed!'}
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          {status === 'expired'
            ? 'Time has run out, please try again'
            : 'Please make the payment again'}
        </p>
        <Button className="mt-20 w-full" onClick={onRetry}>
          Back to payment
        </Button>
      </div>
    );
  }

  // Waiting state — QRIS displayed immediately
  return (
    <div className="p-8 flex flex-col items-center justify-center min-h-159.25 w-149.25">
      <GlassCard>
        <div className="p-8 flex flex-col items-center">
          <h1 className="text-[28px] font-bold text-white mb-2">Scan to Pay</h1>
          <p className="text-[19px] text-[#ffffff]/40 leading-7">
            Use any QRIS-compatible payment app
          </p>

          {/* QR Code */}
          <div className="bg-white rounded-2xl p-4 mb-6 mt-9.5">
            <Image
              src={qrisUrl ?? '/PaymentFlow.svg'}
              alt="QRIS Payment"
              width={280}
              height={280}
              className="rounded-lg"
            />
          </div>

          {/* Dev Triggers */}
          <div className="flex gap-3 mt-6">
            <button
              onClick={() => triggerStatus('processing')}
              className="px-4 py-2 rounded-lg bg-green-500/20 border border-green-500/40 text-green-400 text-sm hover:bg-green-500/30 transition-colors cursor-pointer"
            >
              ✓ Trigger Success
            </button>
            <button
              onClick={() => triggerStatus('failed')}
              className="px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/40 text-red-400 text-sm hover:bg-red-500/30 transition-colors cursor-pointer"
            >
              ✗ Trigger Failed
            </button>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
