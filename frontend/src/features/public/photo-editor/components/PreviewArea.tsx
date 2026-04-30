'use client';

import type { Frame } from '../api/getFrames';
import type { FilterType } from '../pages/PhotoEditorPage';
import GlassCard from '@/components/shared/GlassCard';

interface PreviewAreaProps {
  selectedFrame: Frame | null;
  selectedFilter: FilterType;
}

export default function PreviewArea({
  selectedFrame,
  selectedFilter,
}: PreviewAreaProps) {
  return (
    <div className="h-full  w-full  flex flex-col p-2">
      {/* Preview Label */}
      <p className="gradient-text text-center text-[16px] leading-5 tracking[1.33px] mb-3">
        Preview
      </p>

      {/* Preview Content */}
      <div className="flex-1 flex items-center justify-center min-h-0">
        {!selectedFrame ? (
          // Placeholder when no frame selected
          <div
            className="border-4 border-dashed border-[#3F72AF]/30 rounded-2xl bg-transparent flex items-center justify-center"
            style={{
              aspectRatio: '464/696',
              width: '100%',
              maxWidth: '320px',
              maxHeight: '100%',
            }}
          >
            <p className="gradient-text text-center text-[13px] leading-5 tracking[1.33px]">
              Add Frame First
            </p>
          </div>
        ) : (
          // Display frame image when selected - fills the preview area
          <div
            className="relative flex items-center justify-center"
            style={{
              aspectRatio: '464/696',
              width: '100%',
              maxWidth: '320px',
              height: 'auto',
              maxHeight: '100%',
            }}
          >
            <img
              src={selectedFrame.imageUrl}
              alt={selectedFrame.name}
              className="w-full h-full object-contain rounded-2xl"
            />
          </div>
        )}
      </div>
    </div>
  );
}
