import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig } from '@/lib/react-query';

export interface CreatePaymentInput {
  sessionId: string;
}

export interface CreatePaymentResult {
  transactionId: string;
  sessionId: string;
  qrisUrl: string;
}

export const createPayment = async (
  data: CreatePaymentInput,
): Promise<CreatePaymentResult> => {
  const response = await apiClient.post<CreatePaymentResult>(
    '/api/payments',
    data,
  );
  return response.data;
};

type UseCreatePaymentOptions = {
  mutationConfig?: MutationConfig<typeof createPayment>;
};

export const useCreatePayment = ({
  mutationConfig,
}: UseCreatePaymentOptions = {}) => {
  return useMutation({
    ...mutationConfig,
    mutationFn: createPayment,
  });
};
