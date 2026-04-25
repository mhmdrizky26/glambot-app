import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

export interface Package {
  id: number;
  type: 'digital' | 'print';
  title: string;
  description: string;
  price: number;
  pricePerPrint?: number;
  imageSrc: string;
  isPopular?: boolean;
  durationSecs: number;
  durationMins: number;
}

export const getPackages = async (): Promise<Package[]> => {
  const response = await apiClient.get<Package[]>('/api/packages');
  return response.data;
};

export const getPackagesQueryOptions = () => {
  return queryOptions({ queryKey: ['packages'], queryFn: getPackages });
};

type UsePackagesOptions = {
  queryConfig?: QueryConfig<typeof getPackagesQueryOptions>;
};

export const usePackages = ({ queryConfig }: UsePackagesOptions = {}) => {
  return useQuery({ ...getPackagesQueryOptions(), ...queryConfig });
};
