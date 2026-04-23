'use client';

import { useSearchParams, useRouter } from 'next/navigation';
import { useVoucher } from '../hooks/useVoucher';
import { formatRupiah } from '@/lib/formats';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TicketIcon } from 'lucide-react';

export default function SummaryPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  // Read order data from URL params
  const packageTitle = searchParams.get('title') ?? 'Digital Package';
  const packageType = searchParams.get('type') ?? 'digital';
  const basePrice = Number(searchParams.get('basePrice') ?? 0);
  const printCount = Number(searchParams.get('printCount') ?? 0);
  const pricePerPrint = Number(searchParams.get('pricePerPrint') ?? 0);

  const extraPrintCost = printCount * pricePerPrint;

  const { code, setCode, discount, message, isValid, loading, applyVoucher } =
    useVoucher();

  const subtotal = basePrice + extraPrintCost;
  const total = Math.max(0, subtotal - discount);

  const handleProceed = () => {
    const params = new URLSearchParams({
      title: packageTitle,
      type: packageType,
      total: total.toString(),
    });
    router.push(`/payment/pay?${params.toString()}`);
  };

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-4">
      <GlassCard className="p-8 max-w-[699px]">
        {/* Title */}
        <h1 className="text-[48px] leading-[72px] font-bold text-white text-center mb-8">
          Order Summary
        </h1>

        {/* Line Items */}
        <div className="space-y-4 mb-6">
          {/* Package */}
          <div className="flex justify-between items-center">
            <span className="text-blue-100/50 text-[22.8px] leading-[34px]">
              {packageTitle}
            </span>
            <span className="text-white text-[22.8px] leading-[34px]">
              Rp {formatRupiah(basePrice)}
            </span>
          </div>

          {/* Extra Prints */}
          {packageType === 'print' && printCount > 0 && (
            <div className="flex justify-between items-center">
              <span className="text-blue-100/50 text-[22.8px] leading-[34px]">
                Extra prints (×{printCount})
              </span>
              <span className="text-white text-[22.8px] leading-[34px]">
                Rp {formatRupiah(extraPrintCost)}
              </span>
            </div>
          )}

          {/* Discount */}
          {isValid && discount > 0 && (
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
              Rp {formatRupiah(total)}
            </span>
          </div>
        </div>

        {/* Voucher Input */}
        <div className="flex gap-4 mb-8">
          <div className="flex-1  relative">
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
            className="px-6 py-3.5 text-white disabled:text-white/40"
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
        <Button variant="outline" onClick={handleProceed} className="w-full">
          Proceed to Payment
        </Button>
      </GlassCard>
    </main>
  );
}
