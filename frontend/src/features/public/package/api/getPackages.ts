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

type BackendPackage = {
  id?: number;
  code?: string;
  name?: string;
  title?: string;
  base_price?: number;
  price?: number;
  duration_secs?: number;
  durationSecs?: number;
  description?: string;
  type?: Package['type'];
  imageSrc?: string;
  isPopular?: boolean;
  pricePerPrint?: number;
};

const packageAssets: Record<
  string,
  { type: Package['type']; imageSrc: string; isPopular: boolean }
> = {
  regular: {
    type: 'digital',
    imageSrc: '/Container.svg',
    isPopular: false,
  },
  vip: {
    type: 'print',
    imageSrc: '/Container (1).svg',
    isPopular: true,
  },
};

const normalizePackage = (pkg: BackendPackage): Package => {
  const code = pkg.code ?? (pkg.type === 'print' ? 'vip' : 'regular');
  const asset = packageAssets[code] ?? packageAssets.regular;
  const durationSecs = pkg.duration_secs ?? pkg.durationSecs ?? 0;
  const title = pkg.name ?? pkg.title ?? code;
  const pricePerPrint =
    pkg.pricePerPrint ?? (code === 'vip' ? 15000 : 0);

  return {
    id: pkg.id ?? 0,
    type: pkg.type ?? asset.type,
    title,
    description: pkg.description ?? '',
    price: pkg.base_price ?? pkg.price ?? 0,
    pricePerPrint,
    imageSrc: pkg.imageSrc ?? asset.imageSrc,
    isPopular: pkg.isPopular ?? asset.isPopular,
    durationSecs,
    durationMins: Math.floor(durationSecs / 60),
  };
};

export const getPackages = async (): Promise<Package[]> => {
  const response = await apiClient.get<Package[]>('/api/package');
  return (response.data as unknown as BackendPackage[]).map(normalizePackage);
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
