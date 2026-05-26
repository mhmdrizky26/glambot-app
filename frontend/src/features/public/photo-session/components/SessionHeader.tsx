import { Camera } from 'lucide-react';
import { formatTimeMMSS } from '@/lib/formatTime';

interface SessionHeaderProps {
  sessionTimeLeft?: number;
}

export function SessionHeader({ sessionTimeLeft = 60 }: SessionHeaderProps) {
  const formattedTime = formatTimeMMSS(sessionTimeLeft);

  return (
    <div className="flex items-center justify-between bg-primary/80 backdrop-blur-md border border-white/10 px-5 py-3 rounded-2xl shadow-lg">
      {/* Left: icon + label */}
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-lg bg-[#3f72af]/80 flex items-center justify-center shadow-inner">
          <Camera size={15} className="text-white" />
        </div>
        <span className="text-white font-normal text-2xl leading-5.75  tracking-[0.38px]">
          Photo Session
        </span>
      </div>

      {/* Right: timer */}
      <div className="text-white text-[36px] tracking-[0.38px] leading-5.75 font-normal">
        {formattedTime}
      </div>
    </div>
  );
}
