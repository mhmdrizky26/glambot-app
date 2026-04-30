import { useQuery, queryOptions } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { QueryConfig } from '@/lib/react-query';

// Photo model
export interface Photo {
  id: string;
  url: string;
  sessionId: string;
  thumbnailUrl?: string;
}

export const getPhotos = async (sessionId: string): Promise<Photo[]> => {
  console.log('[API] Fetching photos for sessionId:', sessionId);
  const response = await apiClient.get<Photo[]>(
    `/api/photo-session/${sessionId}/photos`,
  );
  console.log('[API] Photos response:', response.data);
  return response.data;
};

export const getPhotosQueryOptions = (sessionId: string) => {
  return queryOptions({
    queryKey: ['photos', sessionId],
    queryFn: () => getPhotos(sessionId),
  });
};

type UsePhotosOptions = {
  sessionId: string;
  queryConfig?: QueryConfig<typeof getPhotosQueryOptions>;
};

export const usePhotos = ({ sessionId, queryConfig }: UsePhotosOptions) => {
  return useQuery({
    ...getPhotosQueryOptions(sessionId),
    ...queryConfig,
  });
};
