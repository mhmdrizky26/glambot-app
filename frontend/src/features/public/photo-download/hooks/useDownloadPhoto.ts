import { useState, useCallback } from 'react';
import type { Photo } from '@/features/public/photo-editor/api/getPhotos';

export type DownloadState = 'idle' | 'downloading' | 'done' | 'error';

export interface UseDownloadPhotoReturn {
  downloadStates: Record<string, DownloadState>;
  downloadPhoto: (photo: Photo) => Promise<void>;
  downloadAll: (photos: Photo[]) => Promise<void>;
}

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export function useDownloadPhoto(): UseDownloadPhotoReturn {
  const [downloadStates, setDownloadStates] = useState<
    Record<string, DownloadState>
  >({});

  const setPhotoState = useCallback((photoId: string, state: DownloadState) => {
    setDownloadStates((prev) => ({ ...prev, [photoId]: state }));
  }, []);

  const triggerBrowserDownload = useCallback(
    async (url: string, filename: string) => {
      // Fetch as blob so the browser always downloads instead of navigating
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Failed to fetch ${url}`);
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Release the object URL after a short delay
      setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    },
    [],
  );

  const downloadPhoto = useCallback(
    async (photo: Photo): Promise<void> => {
      setPhotoState(photo.id, 'downloading');

      try {
        const filename = `photo-${photo.id}.jpg`;
        await triggerBrowserDownload(photo.url, filename);

        setPhotoState(photo.id, 'done');

        // Auto-reset 'done' → 'idle' after 2 seconds
        setTimeout(() => {
          setPhotoState(photo.id, 'idle');
        }, 2000);
      } catch {
        setPhotoState(photo.id, 'error');
      }
    },
    [setPhotoState, triggerBrowserDownload],
  );

  const downloadAll = useCallback(
    async (photos: Photo[]): Promise<void> => {
      for (let i = 0; i < photos.length; i++) {
        await downloadPhoto(photos[i]);

        // 300ms delay between downloads (skip delay after last photo)
        if (i < photos.length - 1) {
          await delay(300);
        }
      }
    },
    [downloadPhoto],
  );

  return {
    downloadStates,
    downloadPhoto,
    downloadAll,
  };
}
