'use client';

import GlassCard from '@/components/shared/GlassCard';
import type { Frame } from '../api/getFrames';
import type { FilterType } from '../pages/PhotoEditorPage';

// Right panel with tabs for frame and filter selection
type TabType = 'frame' | 'filter';

const tabs: { id: TabType; label: string }[] = [
  { id: 'frame', label: 'Frame' },
  { id: 'filter', label: 'Filter' },
];

// Static filter list — keep order in sync with `lib/filters.ts` getFiltersByType
const FILTER_OPTIONS: { id: FilterType; name: string }[] = [
  { id: 'original', name: 'Original' },
  { id: 'warm', name: 'Warm' },
  { id: 'cool', name: 'Cool' },
  { id: 'vintage', name: 'Vintage' },
  { id: 'dramatic', name: 'Dramatic' },
  { id: 'mono', name: 'Mono' },
  { id: 'sepia', name: 'Sepia' },
  { id: 'vivid', name: 'Vivid' },
  { id: 'soft', name: 'Soft' },
  { id: 'film', name: 'Film' },
];

interface FrameSelectionPanelProps {
  frames: Frame[];
  selectedFrame: Frame | null;
  selectedFilter: FilterType;
  activeTab: TabType;
  onFrameSelect: (frame: Frame) => void;
  onFilterSelect: (filter: FilterType) => void;
  onTabChange: (tab: TabType) => void;
}

interface FrameItemProps {
  frame: Frame;
  isSelected: boolean;
  onClick: () => void;
}

function FrameItem({ frame, isSelected, onClick }: FrameItemProps) {
  const handleClick = () => {
    console.log('[FrameItem] Clicked:', {
      id: frame.id,
      name: frame.name,
      imageUrl: frame.imageUrl,
    });
    onClick();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={`flex flex-col items-center gap-2 p-3 transition-all duration-200
        ${isSelected ? ' scale-105' : ' hover:scale-102'}`}
      aria-pressed={isSelected}
      aria-label={`Select frame ${frame.name}`}
    >
      <div
        className="relative w-full rounded-lg overflow-hidden"
        style={{ aspectRatio: '464/696' }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={frame.imageUrl}
          alt={frame.name}
          className="w-full h-full object-contain"
        />
      </div>
      <span className="text-white text-sm font-medium">{frame.name}</span>
    </button>
  );
}

export default function FrameSelectionPanel({
  frames,
  selectedFrame,
  selectedFilter,
  activeTab,
  onFrameSelect,
  onFilterSelect,
  onTabChange,
}: FrameSelectionPanelProps) {
  return (
    <div className="flex flex-col h-full w-full gap-4">
      {/* Tab header */}
      <div className="flex shrink-0 bg-primary/75 rounded-[19.28px] overflow-hidden p-3">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex-1 py-3 text-[16px] font-bold rounded-2xl transition-all duration-200
              ${
                activeTab === tab.id
                  ? 'text-white bg-[#3F72AF]'
                  : 'text-white/40'
              }`}
            aria-selected={activeTab === tab.id}
            role="tab"
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <GlassCard className="flex-1 overflow-y-auto shadow-none rounded-[19.28px] scrollbar-none">
        {/* Frame tab */}
        {activeTab === 'frame' && (
          <div className="p-4">
            {/* Section label */}
            <p className="text-[#ffff]/40 text-[13px] font-semibold uppercase tracking-wide mb-4">
              Frame Style
            </p>

            {frames.length === 0 ? (
              <p className="text-sm text-white/60 text-center py-8">
                No frames available
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {frames.map((frame) => (
                  <FrameItem
                    key={frame.id}
                    frame={frame}
                    isSelected={selectedFrame?.id === frame.id}
                    onClick={() => onFrameSelect(frame)}
                  />
                ))}
              </div>
            )}
          </div>
        )}

        {/* Filter tab */}
        {activeTab === 'filter' && (
          <div className="p-4 flex flex-col gap-2">
            <p className="text-[#ffff]/40 text-[13px] mb-1">FILTER STYLE</p>
            {FILTER_OPTIONS.map((filter) => {
              const isSelected = selectedFilter === filter.id;
              return (
                <button
                  key={filter.id}
                  type="button"
                  onClick={() => onFilterSelect(filter.id)}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl border transition-all duration-150 text-left
                    ${
                      isSelected
                        ? 'bg-[#3F72AF]/30 border-[#3F72AF] text-[#F9F7F7]'
                        : 'bg-[#F9F7F7]/5 border-[#F9F7F7]/10 text-[#F9F7F7]/60 hover:bg-[#F9F7F7]/10 hover:border-[#F9F7F7]/20'
                    }`}
                  aria-pressed={isSelected}
                >
                  <span className="text-sm font-medium">{filter.name}</span>
                  {isSelected && (
                    <span className="ml-auto w-2 h-2 rounded-full bg-[#3F72AF] shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
