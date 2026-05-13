'use client';

import {
  usePhotos,
  useFramedPhotos,
} from '@/features/public/photo-editor/api/getPhotos';
import { useDownloadPhoto } from '@/features/public/photo-download/hooks/useDownloadPhoto';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/features/public/photo-download/components/ErrorState';
import { PhotoGrid } from '@/features/public/photo-download/components/PhotoGrid';
import { PhotoCard } from '@/features/public/photo-download/components/PhotoCard';
import GlassCard from '@/components/shared/GlassCard';

interface PhotoDownloadPageProps {
  sessionId: string;
}

export function PhotoDownloadPage({ sessionId }: PhotoDownloadPageProps) {
  const {
    data: rawPhotos,
    isLoading: isLoadingRaw,
    isError: isErrorRaw,
    refetch: refetchRaw,
  } = usePhotos({ sessionId });

  const {
    data: framedPhotos,
    isLoading: isLoadingFramed,
    isError: isErrorFramed,
    refetch: refetchFramed,
  } = useFramedPhotos({ sessionId });

  const { downloadStates, downloadPhoto, downloadAll } = useDownloadPhoto();

  if (!sessionId) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <GlassCard
          variant="default"
          className="flex flex-col items-center text-center px-6 py-8 gap-4 max-w-sm"
        >
          <p className="text-white font-semibold text-base">
            Session ID tidak valid.
          </p>
        </GlassCard>
      </main>
    );
  }

  const isLoading = isLoadingRaw || isLoadingFramed;
  const isError = isErrorRaw && isErrorFramed;

  if (isLoading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4 gap-4">
        <div
          role="status"
          aria-label="Memuat foto"
          className="w-14 h-14 rounded-full border-4 border-primary/20 border-t-primary animate-spin"
        />
        <p className="text-primary font-semibold text-base">Memuat foto...</p>
      </main>
    );
  }

  if (isError) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <ErrorState
          onRetry={() => {
            refetchRaw();
            refetchFramed();
          }}
        />
      </main>
    );
  }

  const raw = rawPhotos ?? [];
  const framed = framedPhotos ?? [];
  const allPhotos = [...framed, ...raw];

  if (allPhotos.length === 0) {
    return (
      <main className="flex flex-col items-center justify-center min-h-full px-4">
        <GlassCard
          variant="default"
          className="flex flex-col items-center text-center px-6 py-8 gap-4 max-w-sm"
        >
          <p className="text-white font-semibold text-base">
            Tidak ada foto ditemukan untuk sesi ini.
          </p>
        </GlassCard>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-full px-3 sm:px-4 py-4 sm:py-8 gap-4 sm:gap-6 pb-24">
      {/* Header */}
      <header className="w-full max-w-2xl text-center flex flex-col items-center gap-1.5 sm:gap-2 pt-2">
        <h1 className="text-2xl sm:text-3xl font-bold text-primary leading-tight">
          Download Your Photos
        </h1>
        <p className="text-primary/60 text-xs sm:text-sm">
          {framed.length > 0 && `${framed.length} hasil strip · `}
          {raw.length} foto mentah
        </p>
      </header>

      {/* Framed result (hero section) */}
      {framed.length > 0 && (
        <section className="w-full max-w-2xl flex flex-col gap-2 sm:gap-3">
          <h2 className="text-primary/80 text-xs sm:text-sm font-semibold uppercase tracking-wider px-1">
            Hasil Strip
          </h2>
          <GlassCard
            variant="default"
            maxWidth="max-w-2xl"
            className="flex flex-col items-center gap-4 p-3 sm:p-4"
          >
            <div className="flex flex-col items-center gap-4 w-full">
              {framed.map((photo, index) => (
                <div
                  key={photo.id}
                  className="w-full max-w-[260px] sm:max-w-xs"
                >
                  <PhotoCard
                    photo={photo}
                    index={index}
                    downloadState={downloadStates[photo.id] ?? 'idle'}
                    onDownload={downloadPhoto}
                    aspectClass="aspect-[464/696]"
                    hideLabel
                  />
                </div>
              ))}
            </div>
          </GlassCard>
        </section>
      )}

      {/* Raw photos */}
      {raw.length > 0 && (
        <section className="w-full max-w-2xl flex flex-col gap-2 sm:gap-3">
          <h2 className="text-primary/80 text-xs sm:text-sm font-semibold uppercase tracking-wider px-1">
            Foto Mentah
          </h2>
          <GlassCard
            variant="default"
            maxWidth="max-w-2xl"
            className="flex flex-col gap-4 p-3 sm:p-4"
          >
            <PhotoGrid
              photos={raw}
              onDownload={downloadPhoto}
              downloadStates={downloadStates}
            />
          </GlassCard>
        </section>
      )}

      {/* Download all button — sticky at bottom on mobile for easy reach */}
      <div className="w-full max-w-2xl sticky bottom-3 px-1 z-10">
        <Button
          variant="default"
          size="default"
          className="w-full shadow-2xl"
          onClick={() => downloadAll(allPhotos)}
          aria-label="Download semua foto"
        >
          Download Semua ({allPhotos.length})
        </Button>
      </div>
    </main>
  );
}
