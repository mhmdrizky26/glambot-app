import { ShieldAlert } from 'lucide-react';
import Image from 'next/image';

interface SessionGesture {
  name: string;
  icon: string;
  fingers: string;
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
    <div className="bg-primary/75 border border-white/10 rounded-2xl p-4 shadow-lg flex flex-col h-full overflow-hidden">
      <div className="grid grid-cols-5 gap-3 flex-1 content-start">
        {gestures.map((gesture, i) => {
          const isActive = i === activeGestureIndex;
          const isUnlock = gesture.name === 'Unlock';

          return (
            <button
              key={i}
              onClick={() => onTrigger?.(i)}
              className={`flex flex-col items-center justify-center text-center px-3 py-3.5 min-w-18.75 rounded-xl transition-all duration-200 border ${
                isActive
                  ? 'bg-[#ffff]/35 border-[#ffff]/45  shadow-md scale-105'
                  : 'bg-[#ffff]/5 hover:bg-white/10 border-white/8'
              }`}
            >
              <div className="mb-2 flex items-center justify-center">
                <Image
                  src={gesture.icon}
                  alt={gesture.name}
                  width={34}
                  height={34}
                  className="object-contain"
                />
              </div>
              <h4
                className={`text-sm leading-tight font-normal ${
                  isUnlock ? 'text-white' : 'text-white/70'
                }`}
              >
                {gesture.name}
              </h4>
            </button>
          );
        })}
      </div>

      <div className="flex items-start gap-2.5 mt-auto pt-3.5 border-t border-white/5 shrink-0">
        <ShieldAlert size={13} className="text-[#d4a373] shrink-0 mt-0.5" />
        <div className="flex flex-col text-xs text-white/35 leading-4">
          <span>Stay at least 3 meters away from robot arm</span>
          <span>Keep gestures within detection area</span>
          <span>Avoid sudden movement near robot arm</span>
        </div>
      </div>
    </div>
  );
}
