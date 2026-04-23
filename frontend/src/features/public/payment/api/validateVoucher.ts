import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig } from '@/lib/react-query';

export interface VoucherResult {
  valid: boolean;
  discount: number;
  message: string;
}

export const validateVoucher = async (data: {
  code: string;
}): Promise<VoucherResult> => {
  const response = await apiClient.post<VoucherResult>(
    '/api/vouchers/validate',
    data,
  );
  return response.data;
};

type UseValidateVoucherOptions = {
  mutationConfig?: MutationConfig<typeof validateVoucher>;
};

export const useValidateVoucher = ({
  mutationConfig,
}: UseValidateVoucherOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: validateVoucher,
  });
};
