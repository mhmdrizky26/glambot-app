import { axiosInstance } from '@/lib/api-admin';
import { useMutation } from '@tanstack/react-query';
import { type MutationConfig } from '@/lib/react-query';

export type ExportTransactionsInput = {
  search?: string;
  status?: string;
  month?: number | string;
};

export const exportTransactions = async (
  input?: ExportTransactionsInput,
): Promise<Blob> => {
  const response = await axiosInstance.get('/api/admin/transactions/export', {
    params: input,
    responseType: 'blob',
  });
  return response.data as Blob;
};

type UseExportTransactionsParams = {
  mutationConfig?: MutationConfig<typeof exportTransactions>;
};

export const useExportTransactions = ({
  mutationConfig,
}: UseExportTransactionsParams = {}) => {
  return useMutation({
    mutationFn: exportTransactions,
    ...mutationConfig,
  });
};
