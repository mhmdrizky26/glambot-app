import { Unlock, Lock } from 'lucide-react';

type GestureState = 'waiting' | 'locked' | 'ended';

interface GestureDetectionPanelProps {
  streamUrl: string | null;
  gestureState?: GestureState;
  activeName?: string;
  lockTimeLeft?: number;
  maxLockTime?: number;
}

export function GestureDetectionPanel({
  streamUrl,
  gestureState = 'waiting',
  activeName,
  lockTimeLeft = 0,
  maxLockTime = 15,
}: GestureDetectionPanelProps) {
  const isLocked = gestureState === 'locked';
  const progressPercentage = isLocked ? (lockTimeLeft / maxLockTime) * 100 : 0;

  return (
    <div className="bg-primary/75 border border-white/10 rounded-2xl overflow-hidden shadow-lg flex flex-col h-full">
      {/* Video area */}
      <div className="relative flex-1 min-h-0 bg-black/40">
        {streamUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={streamUrl}
            alt="Gesture detection stream"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <p className="text-white/30 text-xs">Stream tidak tersedia</p>
          </div>
        )}

        {/* Detection box overlay */}
        <div className="absolute inset-0 flex items-center justify-start pl-8 pointer-events-none">
          <div className="w-36 h-44 border border-dashed border-[#00d084]/60 rounded-xl" />
        </div>

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-[#00d084] transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="px-4 py-3 flex items-center justify-between shrink-0">
        {/* Left: lock status */}
        <div className="flex items-center gap-2">
          {isLocked ? (
            <Lock size={14} className="text-[#d4a373]" strokeWidth={2.5} />
          ) : (
            <Unlock size={14} className="text-white/80" strokeWidth={2.5} />
          )}
          <span
            className={`text-sm font-semibold ${
              isLocked ? 'text-[#d4a373]' : 'text-white/80'
            }`}
          >
            {isLocked ? 'Locked' : 'Unlocked'}
          </span>
          {isLocked && activeName && (
            <span className="text-xs text-white/40">→ {activeName}</span>
          )}
        </div>

        {/* Right: waiting indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isLocked ? 'bg-[#d4a373]' : 'bg-[#00d084] animate-pulse'
            }`}
          />
          <span className="text-xs text-white/40">
            {isLocked ? `${lockTimeLeft}s` : 'Waiting..'}
          </span>
        </div>
      </div>

      {/* Hint */}
      <div className="px-4 pb-4 -mt-1 shrink-0 flex items-center gap-2">
        <span className="text-base">🤚</span>
        <p className="text-sm text-[#00d084]/80">
          {isLocked
            ? 'Keep position until lock timer finishes'
            : 'Show open palm to unlock'}
        </p>
      </div>
    </div>
  );
}
