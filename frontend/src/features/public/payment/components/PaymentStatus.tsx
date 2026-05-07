'use client';

import { useState } from 'react';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { usePayment } from '../hooks/usePayment';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import { formatRupiah } from '@/lib/formats';

interface PaymentStatusProps {
  sessionId: string;
  onRetry: () => void;
  onSuccess?: (sessionId: string) => void;
}

function QrisPreview({ src }: { src: string }) {
  const [loadFailed, setLoadFailed] = useState(false);

  if (loadFailed) {
    return (
      <div className="w-70 h-70 rounded-lg bg-slate-100 flex items-center justify-center px-6 text-center">
        <p className="text-slate-600 text-sm leading-6">
          QR image gagal dimuat. Tunggu beberapa detik lalu refresh atau buat
          ulang payment.
        </p>
      </div>
    );
  }

  return (
    // Midtrans QRIS comes from an external URL and is intentionally rendered as a plain image.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt="QRIS Payment"
      width={280}
      height={280}
      className="rounded-lg block"
      onError={() => setLoadFailed(true)}
    />
  );
}

export default function PaymentStatus({
  sessionId,
  onRetry,
  onSuccess,
}: PaymentStatusProps) {
  const { status, qrisUrl, totalPrice, isPending } = usePayment({
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

  if (isPending) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-125">
        <StatusAnimation status="waiting" />
        <h1 className="text-5xl font-bold text-primary leading-20 mb-1">
          Preparing payment...
        </h1>
        <p className="text-primary/50 text-2xl leading-10">
          Please wait a moment
        </p>
      </div>
    );
  }

  // Waiting state — QRIS displayed immediately
  return (
    <div className="w-full max-w-107.5 px-4 py-6 flex justify-center">
      <GlassCard className="shadow-[0px_10px_30px_rgba(17,45,78,0.35)]">
        <div className="flex min-h-160 flex-col items-center px-8 pt-8 pb-7 text-center">
          <h1 className="text-[32px] font-bold leading-none text-white">
            Scan to Pay
          </h1>
          <p className="mt-4 text-[18px] leading-7 text-white/45">
            Use any QRIS-compatible payment app
          </p>

          {/* QR Code */}
          {qrisUrl && (
            <div className="mt-10 rounded-2xl bg-white p-4 shadow-[0px_0px_0px_1px_rgba(255,255,255,0.25)]">
              <QrisPreview key={qrisUrl} src={qrisUrl} />
            </div>
          )}

          {!qrisUrl && (
            <div className="mt-10 rounded-2xl border border-white/15 bg-white/5 px-6 py-8 text-center">
              <p className="text-sm text-white">
                QRIS belum siap. Payment masih diproses, silakan tunggu.
              </p>
            </div>
          )}
          {totalPrice !== null && (
            <p className="mt-3 pt-10 text-[26px] font-semibold leading-none text-white">
              Rp {formatRupiah(totalPrice)}
            </p>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
