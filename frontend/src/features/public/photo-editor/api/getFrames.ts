import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

// Frame model
export interface Frame {
  id: string;
  name: string;
  imageUrl: string;
}

export const getFrames = async (): Promise<Frame[]> => {
  console.log('[API] Fetching frames');
  const response = await apiClient.get<Frame[]>('/api/frames');
  console.log('[API] Frames response:', response.data);
  return response.data;
};

export const getFramesQueryOptions = () => {
  return queryOptions({
    queryKey: ['frames'],
    queryFn: getFrames,
  });
};

type UseFramesOptions = {
  queryConfig?: QueryConfig<typeof getFramesQueryOptions>;
};

export const useFrames = ({ queryConfig }: UseFramesOptions = {}) => {
  return useQuery({
    ...getFramesQueryOptions(),
    ...queryConfig,
  });
};
