import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { MutationConfig } from '@/lib/react-query';

export interface CreatePaymentInput {
  sessionId: string;
}

interface Transaction {
  id: string;
  sessionId: string;
  midtransOrderId: string;
  amount: number;
  status: string;
  qrisUrl: string;
  qrisRawString: string;
  paidAt: string;
  createdAt: string;
}

export interface CreatePaymentResult {
  transaction: Transaction;
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
