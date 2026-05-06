import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

export type SlotShape = 'rect' | 'ellipse';

export interface FrameSlot {
  id: string;
  shape: SlotShape;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export interface Frame {
  id: string;
  name: string;
  imageUrl: string;
  canvasWidth: number;
  canvasHeight: number;
  slots: FrameSlot[];
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
