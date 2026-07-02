import { useState, useEffect } from 'react';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import type { InstructionStep } from '../data/steps';
import { Clock4Icon, Shield, ThumbsDown, ThumbsUp, Camera } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CardProps {
  step: InstructionStep;
  onNext: () => void;
  buttonLabel: string;
}

/** "Get Ready" step — session duration + numbered activity list. */
export function GetReadyCard({ step, onNext, buttonLabel }: CardProps) {
  return (
    <GlassCard maxWidth="max-w-[724px]" className="p-9.5 ">
      <div className="flex flex-col items-center">
        <Clock4Icon size={98} className="text-white mb-6" />
        <h2 className="text-[52px] font-bold text-white leading-19.5 mb-2">
          {step.heading}
        </h2>
        <p className="text-white/40 text-[20px] leading-7.5 mb-8 ">
          {step.subheading}{' '}
          <span className="text-white font-semibold">
            {step.sessionDuration} minutes
          </span>
        </p>

        <div className="grid grid-cols-3 gap-4 mb-6">
          {step.activities?.map((activity, i) => (
            <GlassCard
              key={activity.label}
              variant="secondary"
              className="flex h-30 w-52 flex-col items-center p-4 text-center rounded-xl border"
            >
              <span className="mb-4 flex h-8 w-8 items-center justify-center rounded-full bg-[#F9F7F7]/15 text-lg font-bold text-white">
                {i + 1}
              </span>
              <span className="text-xl font-medium text-white">
                {activity.label}
              </span>
            </GlassCard>
          ))}
        </div>

        <Button variant="outline" onClick={onNext}>
          {buttonLabel}
        </Button>
      </div>
    </GlassCard>
  );
}

/** "Safety & Rules" step — Do / Don't columns. */
export function SafetyRulesCard({ step, onNext, buttonLabel }: CardProps) {
  return (
    <GlassCard maxWidth="max-w-[820px]" className="p-9 overflow-hidden">
      <div className="flex flex-col items-center">
        <Shield size={98} className="text-white mb-6" />
        <h2 className="text-[52px] font-bold text-white leading-19.5 mb-6">
          {step.heading}
        </h2>

        <div className="grid grid-cols-2 gap-6">
          {/* Do column */}
          <GlassCard variant="secondary" className="w-85 p-4 bg-[#3F72AF]/45">
            <div className="flex items-center gap-2 mb-3">
              <ThumbsUp size={16} className="text-blue-100" />
              <span className="text-lg font-bold leading-7 text-white">Do</span>
            </div>
            <ul className="space-y-2">
              {step.doRules?.map((rule, idx) => (
                <li
                  key={`do-${idx}`}
                  className="text-white text-xl font-medium leading-6 flex items-start gap-2"
                >
                  <span className="mt-0.5">•</span>
                  {rule.text}
                </li>
              ))}
            </ul>
          </GlassCard>

          {/* Don't column */}
          <GlassCard variant="secondary" className="w-85 p-4 bg-[#D62F2F]/35">
            <div className="flex items-center gap-1.5 mb-3">
              <ThumbsDown size={16} className="text-red-400 shrink-0" />
              <span className="text-sm font-semibold text-red-400">
                Don&apos;t
              </span>
            </div>
            <ul className="space-y-2">
              {step.dontRules?.map((rule, idx) => (
                <li
                  key={`dont-${idx}`}
                  className="text-white text-xl flex items-start gap-2"
                >
                  <span className="mt-0.5 text-red-400">•</span>
                  {rule.text}
                </li>
              ))}
            </ul>
          </GlassCard>
        </div>

        <Button variant="outline" className="mt-6" onClick={onNext}>
          {buttonLabel}
        </Button>
      </div>
    </GlassCard>
  );
}

/** "Gesture Controls" step. */
export function GestureControlsCard({ step, onNext, buttonLabel }: CardProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [hasCompletedFirstLoop, setHasCompletedFirstLoop] = useState(false);

  useEffect(() => {
    if (!step.gestures || step.gestures.length === 0) return;
    const interval = setInterval(() => {
      setActiveIndex((prev) => {
        const nextIndex = (prev + 1) % step.gestures!.length;
        if (nextIndex === 0 && prev === step.gestures!.length - 1) {
          setHasCompletedFirstLoop(true);
        }
        return nextIndex;
      });
    }, 2500);
    return () => clearInterval(interval);
  }, [step.gestures]);

  // Posisi kamera per preset — mencerminkan pose ABSOLUT robot asli (lihat
  // GambarPresetDobot), bukan gerakan relatif. Tiap preset = kombinasi
  // translate (kiri/kanan + atas/bawah), scale (maju=besar/mundur=kecil), dan
  // rotate (POV nunduk/nengadah). Indeks 0 = Preset 1, dst. Ikon beranimasi
  // halus dari pose sebelumnya ke pose berikutnya via transition-transform.
  const getPresetTransform = () => {
    switch (activeIndex) {
      case 0: // Preset 1 — Netral, di tengah, hadap lurus
        return 'translate(0px, 0px) scale(1) rotate(0deg)';
      case 1: // Preset 2 — Tinggi ke atas, hadap lurus (paling tinggi)
        return 'translate(0px, -62px) scale(1) rotate(0deg)';
      case 2: // Preset 3 — Kiri atas, hadap lurus
        return 'translate(-120px, -40px) scale(1) rotate(0deg)';
      case 3: // Preset 4 — Kanan atas, hadap lurus
        return 'translate(120px, -40px) scale(1) rotate(0deg)';
      case 4: // Preset 5 — Tengah agak atas, agak maju, POV ke bawah
        return 'translate(0px, -34px) scale(1.15) rotate(12deg)';
      case 5: // Preset 6 — Tengah agak bawah, agak maju, POV ke atas
        return 'translate(0px, 22px) scale(1.15) rotate(-12deg)';
      case 6: // Preset 7 — Kanan bawah, hadap lurus
        return 'translate(120px, 40px) scale(1) rotate(0deg)';
      case 7: // Preset 8 — Kiri bawah, hadap lurus
        return 'translate(-120px, 40px) scale(1) rotate(0deg)';
      case 8: // Preset 9 — Tengah agak atas, agak mundur, POV ke bawah
        return 'translate(0px, -46px) scale(0.85) rotate(12deg)';
      case 9: // Preset 10 — Netral di tengah, ke depan, hadap agak ke bawah
        return 'translate(0px, 4px) scale(1.18) rotate(8deg)';
      default:
        return 'translate(0px, 0px) scale(1) rotate(0deg)';
    }
  };

  return (
    <div className="flex flex-col items-center">
      <div className="flex flex-row gap-6 w-full max-w-318.75 justify-center mb-6">
        <div className="w-118.25 shrink-0">
          <GlassCard
            maxWidth="max-w-full"
            className="h-full p-8 flex flex-col items-center text-center relative overflow-hidden"
          >
            <div className="w-full flex flex-col items-center mt-4">
              <h3 className="text-white text-[40px] font-bold leading-15 mb-3">
                Camera Movement
              </h3>
              <p className="text-white/35 text-base leading-6">
                Camera movement based on hand gestures
              </p>
            </div>

            {/* Camera icon centred over horizontal line */}
            <div className="w-full flex justify-center items-center flex-1 relative min-h-35">
              <div className="absolute w-full h-px bg-white/20" />
              <div
                className="relative z-10 w-16 h-12 bg-blue-100 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-[1200ms] ease-in-out"
                style={{ transform: getPresetTransform() }}
              >
                <Camera className="text-primary" size={24} />
                <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 bg-red-500 rounded-full border-2 border-white" />
              </div>
            </div>
          </GlassCard>
        </div>

        <div className="w-3xl shrink-0">
          <GlassCard maxWidth="max-w-full" className="py-6 px-8 flex flex-col">
            <div className="text-center mb-5">
              <h2 className="text-[48px] font-bold text-white mb-1.5 leading-14">
                {step.heading}
              </h2>
              <p className="text-white/35 text-[17px] leading-6">
                {step.subheading}
              </p>
            </div>

            <div className="grid grid-cols-5 gap-3">
              {step.gestures?.map((gesture, i) => {
                const isActive = i === activeIndex;

                return (
                  <GlassCard
                    key={i}
                    variant="secondary"
                    className={cn(
                      'flex h-38 w-31.25 flex-col items-center justify-center rounded-2xl px-2 py-3 text-center transition-all duration-300',
                      isActive
                        ? 'scale-[1.04] border-white/10 bg-[#3f72af]/65 shadow-md'
                        : 'border-transparent',
                    )}
                  >
                    <div className="flex items-center justify-center">
                      {gesture.icon ? (
                        /* eslint-disable-next-line @next/next/no-img-element */
                        <img
                          src={gesture.icon}
                          alt={`Preset ${i + 1}`}
                          width={55}
                          height={55}
                          className="object-contain"
                        />
                      ) : (
                        <span className="inline-block h-14 w-14" />
                      )}
                    </div>

                    <span className="mt-3 text-base font-semibold text-white">
                      Preset {i + 1}
                    </span>
                  </GlassCard>
                );
              })}
            </div>
          </GlassCard>
        </div>
      </div>

      <div className="flex flex-row items-center gap-8">
        <Button
          onClick={onNext}
          className={cn(
            'rounded-full px-8 py-6 text-xl bg-primary hover:bg-primary/90 text-white border-0 shadow-[0_4px_20px_rgba(17,45,78,0.5)] transition-opacity duration-300',
            !hasCompletedFirstLoop && 'opacity-0 pointer-events-none',
          )}
        >
          {buttonLabel}
        </Button>
      </div>
    </div>
  );
}
