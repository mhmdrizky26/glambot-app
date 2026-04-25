import { apiClient } from '@/lib/api-client';

export type PaymentStatusResult = 'pending' | 'paid' | 'failed' | 'expired';

export const getPaymentStatus = async (
  midtransOrderId: string,
): Promise<{ status: PaymentStatusResult }> => {
  const response = await apiClient.get<{ status: PaymentStatusResult }>(
    `/api/payments/${midtransOrderId}/status`,
  );
  return response.data;
};
