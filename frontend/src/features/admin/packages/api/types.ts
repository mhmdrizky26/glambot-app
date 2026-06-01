export type PackageCode = 'vip' | 'regular';
export type PackageStatus = 'active' | 'inactive' | 'draft';
export type PackageType = 'digital' | 'print';

export interface Package {
  id: number;
  code: string;
  name: string;
  description: string;
  price: number;
  durationSecs: number;
  durationMins: number;
  type: PackageType;
  imageSrc: string;
  isPopular: boolean;
  printCount: number;
  status: PackageStatus;
}

export interface PackageStats {
  active: number;
  inactive: number;
  soldToday: number;
  revenueToday: number;
}

export interface PaginationMeta {
  total: number;
  page: number;
  lastPage: number;
}

export interface PackageResponse {
  data: Package[];
  meta: PaginationMeta;
}

export type BackendResponse = {
  id: number;
  code: string;
  name: string;
  price: number;
  duration_secs: number;
  duration_mins: number;
  description: string;
  image_src: string;
  is_popular: boolean;
  print_count: number;
  status?: PackageStatus;
};

const toAbsoluteUrl = (path: string | undefined): string => {
  if (!path) return '';
  if (path.startsWith('http')) return path;
  if (path.startsWith('/storage/'))
    return `${process.env.NEXT_PUBLIC_API_URL || ''}${path}`;
  return path;
};

export const normalizePackage = (data: BackendResponse): Package => ({
  id: data.id,
  code: data.code,
  name: data.name,
  description: data.description || '',
  price: data.price,
  durationSecs: data.duration_secs,
  durationMins: data.duration_mins,
  type: data.code === 'vip' ? 'print' : 'digital',
  imageSrc: toAbsoluteUrl(data.image_src),
  isPopular: data.is_popular,
  printCount: data.print_count,
  status: data.status || 'draft',
});
