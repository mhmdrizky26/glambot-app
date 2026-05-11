'use client';

import { usePhotos } from '@/features/public/photo-editor/api/getPhotos';
import { useDownloadPhoto } from '@/features/public/photo-download/hooks/useDownloadPhoto';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/features/public/photo-download/components/ErrorState';
import { PhotoGrid } from '@/features/public/photo-download/components/PhotoGrid';
import GlassCard from '@/components/shared/GlassCard';

interface PhotoDownloadPageProps {
  sessionId: string;
}

export function PhotoDownloadPage({ sessionId }: PhotoDownloadPageProps) {
  const { data, isLoading, isError, refetch } = usePhotos({ sessionId });
  const { downloadStates, downloadPhoto, downloadAll } = useDownloadPhoto();

  // Validate sessionId
  if (!sessionId) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <GlassCard
          variant="default"
          className="flex flex-col items-center text-center px-8 py-10 gap-4"
        >
          <p className="text-primary font-semibold text-base">
            Session ID tidak valid.
          </p>
        </GlassCard>
      </main>
    );
  }

  // Expired state — validation commented out for now
  // const isExpired = checkIsExpired(sessionCreatedAt);
  // if (isExpired) {
  //   return (
  //     <main className="flex flex-col items-center justify-center min-h-full px-4">
  //       <ExpiredState />
  //     </main>
  //   );
  // }

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <StatusAnimation status="processing" />
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <ErrorState onRetry={refetch} />
      </main>
    );
  }

  if (data?.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <GlassCard
          variant="default"
          className="flex flex-col items-center text-center px-8 py-10 gap-4"
        >
          <p className="text-primary font-semibold text-base">
            Tidak ada foto ditemukan untuk sesi ini.
          </p>
        </GlassCard>
      </main>
    );
  }

  const photos = data ?? [];

  return (
    <main className="flex flex-col items-center min-h-full px-4 py-8 gap-6">
      {/* Header */}
      <div className="w-full max-w-2xl text-center flex flex-col items-center gap-2">
        <h1 className="text-3xl font-bold text-primary">
          Download Your Photos
        </h1>
        <p className="text-primary/60 text-sm">
          {photos.length} photos available · tap the download icon to save each
          one
        </p>
      </div>

      {/* Scrollable photo grid inside GlassCard */}
      <GlassCard
        variant="default"
        maxWidth="max-w-2xl"
        className="flex flex-col gap-4 p-4 overflow-y-auto max-h-[60vh] scrollbar-none"
      >
        <PhotoGrid
          photos={photos}
          onDownload={downloadPhoto}
          downloadStates={downloadStates}
        />
      </GlassCard>

      {/* Download all button */}
      <div className="w-full max-w-2xl">
        <Button
          variant="default"
          size="default"
          className="w-full"
          onClick={() => downloadAll(photos)}
          aria-label="Download semua foto"
        >
          Download All
        </Button>
      </div>
    </main>
  );
}
