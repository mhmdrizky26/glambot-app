import { useMutation } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';
import type { FilterType } from '../pages/PhotoEditorPage';

export interface SaveCompositionInput {
  sessionId: string;
  frameId: string;
  filter: FilterType;
  photoIds: string[];
  composedImage: Blob;
}

export interface CompositionResponse {
  id: string;
  sessionId: string;
  imageUrl: string;
  createdAt: string;
}

/**
 * Save composition to backend
 */
export const saveComposition = async (
  input: SaveCompositionInput,
): Promise<CompositionResponse> => {
  const formData = new FormData();
  formData.append('sessionId', input.sessionId);
  formData.append('frameId', input.frameId);
  formData.append('filter', input.filter);
  formData.append('photoIds', JSON.stringify(input.photoIds));
  formData.append('image', input.composedImage, 'composition.jpg');

  // Note: don't set Content-Type manually — axios/browser will set it
  // with the correct multipart boundary parameter automatically.
  const response = await apiClient.post(`/api/photo/compose`, formData);

  return response.data;
};

/**
 * React Query mutation hook
 */
export const useSaveComposition = () => {
  return useMutation({
    mutationFn: saveComposition,
    onSuccess: (data) => {
      console.log('Composition saved:', data.imageUrl);
    },
    onError: (error) => {
      console.error('Failed to save composition:', error);
    },
  });
};
