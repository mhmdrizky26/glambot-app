import { RefObject } from 'react';
import { Unlock, Lock } from 'lucide-react';

type GestureState = 'waiting' | 'locked' | 'ended';

interface GestureDetectionPanelProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  gestureState?: GestureState;
  activeName?: string;
  lockTimeLeft?: number;
  maxLockTime?: number;
}

export function GestureDetectionPanel({
  videoRef,
  gestureState = 'waiting',
  activeName,
  lockTimeLeft = 0,
  maxLockTime = 15, // Default 15 detik
}: GestureDetectionPanelProps) {
  const isLocked = gestureState === 'locked';

  const progressPercentage = isLocked ? (lockTimeLeft / maxLockTime) * 100 : 0;

  return (
    <div className="bg-primary/75 border border-white/10 rounded-2xl overflow-hidden shadow-lg flex flex-col h-full">
      <div className="relative bg-black/40">
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-45 object-cover"
        />

        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div className="w-40 h-27.5 border border-dashed border-white/25 rounded-xl" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-[#00d084] transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercentage}%` }}
          />
        </div>
      </div>

      <div className="px-3 py-2.5 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          {isLocked ? (
            <Lock size={12} className="text-[#d4a373]" strokeWidth={2.5} />
          ) : (
            <Unlock size={12} className="text-[#00d084]" strokeWidth={2.5} />
          )}
          <span
            className={`text-[12px] font-semibold ${
              isLocked ? 'text-[#d4a373]' : 'text-[#00d084]'
            }`}
          >
            {isLocked ? 'Locked' : 'Unlocked'}
          </span>
          {isLocked && (
            <span className="ml-1 text-[10px] text-white/40">
              → {activeName}
            </span>
          )}
        </div>
        <div
          className={`w-1.5 h-1.5 rounded-full ${
            isLocked ? 'bg-[#d4a373]' : 'bg-[#00d084] animate-pulse'
          }`}
        />
      </div>

      <div className="px-3 pb-3 -mt-1">
        <p className="text-[11px] text-[#00d084]/80 leading-relaxed">
          {isLocked
            ? 'Keep position until lock timer finishes'
            : 'Show open palm to unlock'}
        </p>
      </div>
    </div>
  );
}
