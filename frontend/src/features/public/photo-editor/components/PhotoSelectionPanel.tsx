'use client';

import { StatusAnimation } from '@/components/shared/StatusAnimation';
import GlassCard from '@/components/shared/GlassCard';
import type { Photo } from '../api/getPhotos';

// Left panel displaying scrollable grid of session photos
interface PhotoSelectionPanelProps {
  photos: Photo[];
  isLoading: boolean;
}

interface PhotoItemProps {
  photo: Photo;
}

function PhotoItem({ photo }: PhotoItemProps) {
  return (
    <div
      data-testid={`photo-thumbnail-${photo.id}`}
      className="relative aspect-square w-full rounded-xl overflow-hidden transition-all duration-150 shadow-md"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.thumbnailUrl ?? photo.url}
        alt={`Photo ${photo.id}`}
        draggable={false}
        className="w-full h-full object-cover pointer-events-none select-none"
      />
    </div>
  );
}

export default function PhotoSelectionPanel({
  photos,
  isLoading,
}: PhotoSelectionPanelProps) {
  if (isLoading) {
    return (
      <GlassCard className="flex flex-col h-full max-w-none shadow-none">
        <div className="flex items-center justify-center h-full">
          <StatusAnimation status="waiting" className="w-16 h-16" />
        </div>
      </GlassCard>
    );
  }

  if (photos.length === 0) {
    return (
      <GlassCard className="flex flex-col h-full max-w-none">
        <div className="flex flex-col items-center justify-center h-full gap-3 px-4 py-8 text-center">
          <div className="w-12 h-12 rounded-xl bg-[#F9F7F7]/10 border border-[#F9F7F7]/15 flex items-center justify-center">
            <span className="text-[#3F72AF] text-xl opacity-60">🖼️</span>
          </div>
          <p className="text-[#F9F7F7]/60 text-sm font-medium">
            No photos available.
          </p>
          <p className="text-[#F9F7F7]/35 text-xs leading-relaxed">
            Complete a photo session first.
          </p>
        </div>
      </GlassCard>
    );
  }

  return (
    <GlassCard className="flex flex-col shadow-none h-full max-w-none rounded-[19.28px]">
      <div className="flex-1 overflow-y-auto min-h-0 p-3 scrollbar-none">
        <p className="text-[#ffff]/40 text-[13px] pl-3">SELECT PHOTO</p>
        <div data-testid="photo-gallery" className="grid grid-cols-2 gap-2 p-2">
          {photos.map((photo) => (
            <PhotoItem key={photo.id} photo={photo} />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
