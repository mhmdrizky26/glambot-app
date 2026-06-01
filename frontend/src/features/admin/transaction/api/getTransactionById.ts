import { queryOptions, useQuery } from '@tanstack/react-query';
import { axiosInstance } from '@/lib/api-admin';
import { type QueryConfig } from '@/lib/react-query';
import {
  type Transaction,
  type BackendResponse,
  normalizeTransaction,
} from './types';

export const getTransactionById = async (
  id: string,
): Promise<Transaction> => {
  const response = await axiosInstance.get(`/api/admin/transactions/${id}`);
  return normalizeTransaction(response.data as unknown as BackendResponse);
};

export const getTransactionByIdQueryKey = (id: string) => {
  return ['transactions', 'detail', id] as const;
};

export const getTransactionByIdQueryOptions = (id: string) => {
  return queryOptions({
    queryKey: getTransactionByIdQueryKey(id),
    queryFn: () => getTransactionById(id),
    enabled: !!id,
  });
};

type UseGetTransactionByIdParams = {
  queryConfig?: QueryConfig<typeof getTransactionByIdQueryOptions>;
  id: string;
};

export const useGetTransactionById = ({
  id,
  queryConfig,
}: UseGetTransactionByIdParams) => {
  return useQuery({
    ...getTransactionByIdQueryOptions(id),
    ...queryConfig,
  });
};
