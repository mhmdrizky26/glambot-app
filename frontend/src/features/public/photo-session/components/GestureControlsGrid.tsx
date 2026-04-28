import { ShieldAlert } from 'lucide-react';

interface SessionGesture {
  name: string;
  emoji: string;
}

interface GestureControlsGridProps {
  gestures: SessionGesture[];
  activeGestureIndex?: number | null;
  onTrigger?: (index: number) => void;
}

export function GestureControlsGrid({
  gestures,
  activeGestureIndex = null,
  onTrigger,
}: GestureControlsGridProps) {
  return (
    <div className="bg-primary/75 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col flex-1 h-full">

      <div className="grid grid-cols-5 gap-2 mb-auto">
        {gestures.map((gesture, i) => {
          const isActive = i === activeGestureIndex;
          const isUnlock = gesture.name === 'Unlock';

          return (
            <button
              key={i}
              onClick={() => onTrigger?.(i)}
              className={`flex flex-col items-center justify-center text-center p-1.5 h-[66px] rounded-xl transition-all duration-200 border ${
                isActive
                  ? 'bg-[#3f72af]/70 border-white/20 shadow-md scale-105'
                  : 'bg-white/5 hover:bg-white/10 border-white/5'
              }`}
            >
              <div className="text-[22px] mb-1">{gesture.emoji}</div>
              <h4
                className={`text-[9px] leading-tight font-medium ${
                  isUnlock ? 'text-[#00d084]' : 'text-white/70'
                }`}
              >
                {gesture.name}
              </h4>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 mt-4 pt-3.5 border-t border-white/5">
        <ShieldAlert size={13} className="text-[#d4a373] shrink-0 mt-0.5" />
        <div className="flex flex-col text-[9.5px] text-white/30 leading-[15px]">
          <span>Stay at least 3 meters away from robot arm</span>
          <span>Keep gestures within detection area</span>
          <span>Avoid sudden movement near robot arm</span>
        </div>
      </div>
    </div>
  );
}
