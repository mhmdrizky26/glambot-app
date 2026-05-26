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

// Shape backend response untuk POST /api/photo/compose
// (lihat handlers/photo.go ComposeFrame). Field-field snake_case sesuai
// JSON encoding di backend — api-client interceptor sudah strip wrapper
// `{success, data: ...}` jadi caller pegang langsung object di bawah ini.
export interface CompositionResponse {
  result_id: string;
  download_url: string;
  preview_url: string;
  gif_url: string;
  gif_live_url: string;
  status: string;
  message: string;
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
    onError: (error) => {
      console.error('Failed to save composition:', error);
    },
  });
};
