import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig } from '@/lib/react-query';

export interface ApplyVoucherResponse {
  valid: boolean;
  message: string;
  discountAmount: number;
  finalPrice: number;
  voucher: {
    code: string;
    description: string;
    discountType: string;
    discountValue: number;
  } | null;
}

export const applyVoucher = async (data: {
  sessionId: string;
  voucherCode: string;
}): Promise<ApplyVoucherResponse> => {
  const response = await apiClient.post<ApplyVoucherResponse>(
    '/api/voucher/apply',
    data,
  );
  return response.data;
};

type UseApplyVoucherOptions = {
  mutationConfig?: MutationConfig<typeof applyVoucher>;
};

export const useApplyVoucher = ({
  mutationConfig,
}: UseApplyVoucherOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: applyVoucher,
  });
};
