'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { fabric } from 'fabric';

import { StatusAnimation } from '@/components/shared/StatusAnimation';
import PhotoSelectionPanel from '../components/PhotoSelectionPanel';
import PreviewArea from '../components/PreviewArea';
import FrameSelectionPanel from '../components/FrameSelectionPanel';
import ConfirmPrintButton from '../components/ConfirmPrintButton';

import { usePhotos } from '../api/getPhotos';
import { useFrames } from '../api/getFrames';
import type { Frame } from '../api/getFrames';
import { exportComposition } from '../lib/exportComposition';
import { useSaveComposition } from '../api/saveComposition';
import { usePhotoComposition } from '../hooks/usePhotoComposition';

// Filter type
export type FilterType = 'original' | 'warm' | 'cool' | 'vintage' | 'dramatic';

type TabType = 'frame' | 'filter';

export default function PhotoEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  if (!sessionId) return null;

  // State
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('original');
  const [activeTab, setActiveTab] = useState<TabType>('frame');
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  // Photo composition tracking
  const {
    slots,
    addPhotoToSlot,
    setFrame: setCompositionFrame,
    setFilter: setCompositionFilter,
  } = usePhotoComposition();

  // Fetch data
  const { data: photos = [], isLoading: photosLoading } = usePhotos({
    sessionId,
  });

  const { data: frames = [], isLoading: framesLoading } = useFrames();

  // Save composition mutation
  const { mutate: saveComposition, isPending: isSaving } = useSaveComposition();

  // Loading state
  if (photosLoading || framesLoading) {
    return (
      <div className="flex items-center justify-center min-h-full">
        <StatusAnimation status="waiting" className="w-24 h-24" />
      </div>
    );
  }

  // Frame and filter selection handlers
  const handleFrameSelect = (frame: Frame) => {
    console.log('[PhotoEditorPage] Frame selected:', {
      id: frame.id,
      name: frame.name,
    });

    setSelectedFrame(frame);
    setCompositionFrame(frame);
  };

  const handleFilterSelect = (filter: FilterType) => {
    setSelectedFilter(filter);
    setCompositionFilter(filter);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // Handle photo dropped into slot
  const handlePhotoDropped = (
    slotId: string,
    photoId: string,
    photoUrl: string,
  ) => {
    console.log('[PhotoEditorPage] Photo dropped:', {
      slotId,
      photoId,
      photoUrl,
    });
    addPhotoToSlot(slotId, photoId, photoUrl);
  };

  // Confirm Print logic
  const isConfirmEnabled = selectedFrame !== null;

  const handleConfirmPrint = async () => {
    if (!isConfirmEnabled || !fabricCanvasRef.current) return;

    try {
      // Collect photo IDs from slots
      const photoIds = Object.values(slots)
        .filter((slot) => slot.photoId !== null)
        .map((slot) => slot.photoId as string);

      console.log(
        '[PhotoEditorPage] Saving composition with photo IDs:',
        photoIds,
      );

      // Export canvas at high resolution
      const exported = await exportComposition(fabricCanvasRef.current, {
        format: 'jpeg',
        quality: 0.95,
        multiplier: 3,
      });

      console.log(
        'Export size:',
        (exported.fileSize / 1024 / 1024).toFixed(2),
        'MB',
      );

      const downloadLink = document.createElement('a');
      downloadLink.href = exported.dataUrl;
      downloadLink.download = `photo-composition-${sessionId}-${Date.now()}.jpg`;
      document.body.appendChild(downloadLink);
      downloadLink.click();
      document.body.removeChild(downloadLink);

      // Save to backend
      saveComposition(
        {
          sessionId,
          frameId: selectedFrame!.id,
          filter: selectedFilter,
          photoIds, // Now tracking photo IDs from composition state
          composedImage: exported.blob,
        },
        {
          onSuccess: () => {
            router.push(`/session-end?sessionId=${sessionId}`);
          },
          onError: (error) => {
            console.error('Failed to save composition:', error);
            alert('Failed to save composition. Please try again.');
          },
        },
      );
    } catch (error) {
      console.error('Export failed:', error);
      alert('Failed to export composition. Please try again.');
    }
  };

  return (
    <div className="h-full w-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="w-full text-center py-1 shrink-0">
        <h1 className="text-primary text-[60px] font-bold tracking-tight">
          Select & Edit
        </h1>
      </div>

      {/* Main Content - 3 panels + confirm button */}
      <div className="flex-1 flex flex-col min-h-0 px-6 pb-6 gap-3">
        {/* Panels row */}
        <div className="flex-1 flex items-stretch gap-3 min-h-0">
          {/* Left Panel */}
          <div className="w-84.25 shrink-0">
            <PhotoSelectionPanel photos={photos} isLoading={photosLoading} />
          </div>

          {/* Center Panel */}
          <div className="flex-1 min-w-0 flex items-center justify-center">
            <PreviewArea
              selectedFrame={selectedFrame}
              selectedFilter={selectedFilter}
              onPhotoDropped={handlePhotoDropped}
              onCanvasReady={(canvas) => {
                fabricCanvasRef.current = canvas;
              }}
            />
          </div>

          {/* Right Panel */}
          <div className="w-84.25 shrink-0">
            <FrameSelectionPanel
              frames={frames}
              selectedFrame={selectedFrame}
              selectedFilter={selectedFilter}
              activeTab={activeTab}
              onFrameSelect={handleFrameSelect}
              onFilterSelect={handleFilterSelect}
              onTabChange={handleTabChange}
            />
          </div>
        </div>

        {/* Confirm Print Button — below right panel, aligned right */}
        <div className="flex justify-end">
          <div className="w-84.25">
            <ConfirmPrintButton
              disabled={!isConfirmEnabled}
              onClick={handleConfirmPrint}
            />
          </div>
        </div>
      </div>

      {/* Loading overlay during save */}
      {isSaving && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6">
            <StatusAnimation status="waiting" className="w-16 h-16" />
          </div>
        </div>
      )}
    </div>
  );
}
