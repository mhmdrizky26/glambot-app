'use client';

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { StatusAnimation } from '@/components/shared/StatusAnimation';
import PhotoSelectionPanel from '../components/PhotoSelectionPanel';
import PreviewArea from '../components/PreviewArea';
import FrameSelectionPanel from '../components/FrameSelectionPanel';
import ConfirmPrintButton from '../components/ConfirmPrintButton';

import { usePhotos } from '../api/getPhotos';
import { useFrames } from '../api/getFrames';
import type { Frame } from '../api/getFrames';

// Filter type
export type FilterType = 'original' | 'warm' | 'cool' | 'vintage' | 'dramatic';

type TabType = 'frame' | 'filter';

export default function PhotoEditorPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('sessionId') || 'test-session';

  // State
  const [selectedFrame, setSelectedFrame] = useState<Frame | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<FilterType>('original');
  const [activeTab, setActiveTab] = useState<TabType>('frame');

  // Fetch data
  const { data: photos = [], isLoading: photosLoading } = usePhotos({
    sessionId,
  });

  const { data: frames = [], isLoading: framesLoading } = useFrames();

  // Loading state
  if (photosLoading || framesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
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
  };

  const handleFilterSelect = (filter: FilterType) => {
    setSelectedFilter(filter);
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
  };

  // Confirm Print logic
  const isConfirmEnabled = selectedFrame !== null;

  const handleConfirmPrint = () => {
    if (!isConfirmEnabled) return;

    // TODO: Save composition
    console.log('Composition saved:', {
      sessionId,
      frameId: selectedFrame?.id,
      filter: selectedFilter,
    });

    // Navigate to session-end screen (get-photos -> done)
    router.push(`/session-end?sessionId=${sessionId}`);
  };

  return (
    <div className="h-screen w-full flex flex-col">
      {/* Header */}
      <div className="w-full text-center py-1 shrink-0">
        <h1 className="text-primary text-[60px] font-bold tracking-tight">
          Select & Edit
        </h1>
      </div>

      {/* Main Content - 3 equal height panels */}
      <div className="flex-1 flex items-center justify-center gap-6  px-6 pb-10 overflow-hidden relative">
        {/* Left Panel */}
        <div className="w-84.25 h-full max-h-137.5">
          <PhotoSelectionPanel photos={photos} isLoading={photosLoading} />
        </div>

        {/* Center Panel */}
        <div className="w-120 h-full max-h-137.5 flex items-center justify-center">
          <PreviewArea
            selectedFrame={selectedFrame}
            selectedFilter={selectedFilter}
          />
        </div>

        {/* Right Panel */}
        <div className="w-84.25 h-full max-h-137.5">
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

        {/* Confirm Print Button - positioned below right panel */}
        <div className="absolute bottom-4 right-27 w-84.25">
          <ConfirmPrintButton
            disabled={!isConfirmEnabled}
            onClick={handleConfirmPrint}
          />
        </div>
      </div>
    </div>
  );
}
