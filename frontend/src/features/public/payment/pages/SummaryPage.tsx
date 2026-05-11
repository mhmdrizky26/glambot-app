'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useGetSession } from '@/shared/api/session';
import { useVoucher } from '../hooks/useVoucher';
import { formatRupiah } from '@/lib/formats';
import GlassCard from '@/components/shared/GlassCard';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TicketIcon, Timer as TimerIcon } from 'lucide-react';
import Timer from '@/components/shared/Timer';

export default function SummaryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) {
      router.replace('/package');
    }
  }, [sessionId, router]);

  const {
    data: session,
    isLoading,
    error: getError,
  } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  const isNotFound = !!(
    getError && (getError as { statusCode?: number }).statusCode === 404
  );

  const { code, setCode, message, isValid, loading, applyVoucher } =
    useVoucher(sessionId);

  const handleProceed = () => {
    router.push(`/payment/pay?sessionId=${sessionId}`);
  };

  if (!sessionId) return null;

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <StatusAnimation status="waiting" className="w-37.5 h-37.5" />
      </main>
    );
  }

  if (isNotFound) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <TimerIcon />
        <GlassCard className="p-8 max-w-174.75">
          <p className="text-white text-center text-xl mb-6">
            Session not found
          </p>
          <Button
            variant="outline"
            onClick={() => router.push('/package')}
            className="w-full"
          >
            Back to Packages
          </Button>
        </GlassCard>
      </main>
    );
  }

  const packageTitle = session?.packageTitle ?? '';
  const basePrice = session?.basePrice ?? 0;
  const extraPrintCost = session?.extraPrintCost ?? 0;
  const discount = session?.discount ?? 0;
  const finalPrice = session?.finalPrice ?? 0;

  return (
    <main className="flex flex-col items-center justify-center min-h-full px-4">
      <Timer />
      <GlassCard className="px-13.5 pb-[56.59px] pt-[54.92px] max-w-174.75">
        {/* Title */}
        <h1 className="text-[48.46px] leading-[72.7px] font-bold text-white text-center mb-10.75">
          Order Summary
        </h1>

        {/* Line Items */}
        <div className="space-y-4 mb-6">
          {/* Package */}
          <div className="flex justify-between items-center">
            <span className="text-blue-100/50 text-[22.8px] leading-8.5">
              {packageTitle}
            </span>
            <span className="text-white text-[22.8px] leading-8.5">
              Rp {formatRupiah(basePrice)}
            </span>
          </div>

          {/* Extra Prints */}
          {extraPrintCost > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-blue-100/50 text-[22.8px] leading-8.5">
                Extra prints
              </span>
              <span className="text-white text-[22.8px] leading-8.5">
                Rp {formatRupiah(extraPrintCost)}
              </span>
            </div>
          )}

          {/* Discount */}
          {discount > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-green-400 text-base">Voucher discount</span>
              <span className="text-green-400 text-base">
                - Rp {formatRupiah(discount)}
              </span>
            </div>
          )}
        </div>

        {/* Divider + Total */}
        <div className="border-t border-white/15 pt-4 mb-8">
          <div className="flex justify-between items-center">
            <span className="text-white text-3xl leading-11 font-medium">
              Total
            </span>
            <span className="text-white text-[29px] leading-11 font-bold">
              Rp {formatRupiah(finalPrice)}
            </span>
          </div>
        </div>

        {/* Voucher Input */}
        <div className="flex gap-4 mb-8">
          <div className="flex-1 relative">
            <TicketIcon
              size={26}
              className="absolute left-4 top-1/2 -translate-y-1/2 z-10 text-blue-100"
            />
            <Input
              type="text"
              placeholder="Voucher code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && applyVoucher()}
              disabled={isValid}
              className="pl-16"
            />
          </div>
          <Button
            variant="outline"
            size="default"
            onClick={applyVoucher}
            disabled={loading || !code.trim() || isValid}
            className="px-6 py-3.5 text-white disabled:text-white/40 rounded-[18.85px]"
          >
            {loading ? '...' : 'Apply'}
          </Button>
        </div>

        {/* Voucher Message */}
        {message && (
          <p
            className={`text-sm text-center mb-6 -mt-4 ${
              isValid ? 'text-green-400' : 'text-red-400'
            }`}
          >
            {message}
          </p>
        )}

        {/* Proceed Button */}
        <Button
          variant="outline"
          onClick={handleProceed}
          className="w-[592.29px] py-[26.58px] px-[58.48px] rounded-[45.9px] text-[26.45px] leading-[39.7px] font-medium"
        >
          Proceed to Payment
        </Button>
      </GlassCard>
    </main>
  );
}
