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
    <div className="bg-primary/75 border border-white/10 rounded-2xl py-[24.9px] px-[52.11px] shadow-lg h-160.25 overflow-hidden">
      {/* Grid mengisi penuh tinggi container, 5 baris auto */}
      <div className="grid grid-cols-2 grid-rows-5 gap-x-1.5 gap-y-[8.7px] h-full">
        {gestures.map((gesture, i) => {
          const isActive = i === activeGestureIndex;

          return (
            <div key={i} className="flex justify-center items-center">
              <button
                onClick={() => onTrigger?.(i)}
                className={`flex w-[91.66px] h-full max-h-[111.26px] flex-col items-center justify-center text-center px-3 py-3 rounded-xl transition-all duration-200 border ${
                  isActive
                    ? 'bg-white/35 border-white/45 shadow-md scale-105'
                    : 'bg-white/5 hover:bg-white/10 border-white/8'
                }`}
              >
                <div className="mb-2 flex items-center justify-center">
                  <Image
                    src={gesture.icon}
                    alt={gesture.name}
                    width={33}
                    height={33}
                    className="object-contain"
                  />
                </div>
                <h4 className="text-[17px] leading-[19.3px] font-normal text-[#ffff]/70 text-center">
                  {gesture.name}
                </h4>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
