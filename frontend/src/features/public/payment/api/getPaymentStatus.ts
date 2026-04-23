import { apiClient } from '@/lib/api-client';

export type PaymentStatusResult = 'pending' | 'paid' | 'failed' | 'expired';

export const getPaymentStatus = async (
  transactionId: string,
): Promise<{ status: PaymentStatusResult }> => {
  const response = await apiClient.get<{ status: PaymentStatusResult }>(
    `/api/payments/${transactionId}/status`,
  );
  return response.data;
};
