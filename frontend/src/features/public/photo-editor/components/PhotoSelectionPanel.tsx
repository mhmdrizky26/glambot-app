'use client';

import { Check } from 'lucide-react';
import { StatusAnimation } from '@/components/shared/StatusAnimation';
import GlassCard from '@/components/shared/GlassCard';
import type { Photo } from '../api/getPhotos';

// Left panel displaying scrollable grid of session photos. Touchscreen: foto
// dipilih dengan TAP (bukan drag). Foto terpilih ("armed") lalu di-tap ke slot
// pada preview untuk ditempatkan.
interface PhotoSelectionPanelProps {
  photos: Photo[];
  isLoading: boolean;
  armedPhotoId: string | null;
  onPhotoTap: (photo: Photo) => void;
}

interface PhotoItemProps {
  photo: Photo;
  isArmed: boolean;
  onTap: () => void;
}

function PhotoItem({ photo, isArmed, onTap }: PhotoItemProps) {
  return (
    <button
      type="button"
      data-testid={`photo-thumbnail-${photo.id}`}
      onClick={onTap}
      aria-pressed={isArmed}
      className={`relative aspect-square w-full rounded-xl overflow-hidden transition-all duration-150 shadow-md touch-manipulation ${
        isArmed
          ? 'ring-4 ring-[#3F72AF] scale-[1.03] shadow-lg'
          : 'ring-0 hover:scale-[1.03] hover:shadow-lg active:scale-95'
      }`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={photo.thumbnailUrl ?? photo.url}
        alt={`Photo ${photo.id}`}
        draggable={false}
        className="w-full h-full object-cover pointer-events-none select-none"
      />
      {/* Badge saat foto sedang dipilih untuk ditempatkan. */}
      {isArmed && (
        <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-7 h-7 rounded-full bg-[#3F72AF] text-white shadow-md">
          <Check size={16} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

export default function PhotoSelectionPanel({
  photos,
  isLoading,
  armedPhotoId,
  onPhotoTap,
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
        <p className="text-[#ffff]/40 text-[13px] pl-3">
          {armedPhotoId ? 'TAP A SLOT TO PLACE' : 'TAP A PHOTO'}
        </p>
        <div data-testid="photo-gallery" className="grid grid-cols-2 gap-2 p-2">
          {photos.map((photo) => (
            <PhotoItem
              key={photo.id}
              photo={photo}
              isArmed={armedPhotoId === photo.id}
              onTap={() => onPhotoTap(photo)}
            />
          ))}
        </div>
      </div>
    </GlassCard>
  );
}
