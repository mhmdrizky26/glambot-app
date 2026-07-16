import { useState, useEffect } from 'react';
import GlassCard from '@/components/shared/GlassCard';
import { Button } from '@/components/ui/button';
import type { InstructionStep } from '../data/steps';
import {
  Camera,
  Hand,
  Ruler,
  LayoutGrid,
  Sparkles,
  ShieldCheck,
  CircleAlert,
  ShieldAlert,
  Ban,
  WifiOff,
  CupSoda,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Pemetaan kunci ikon (dari data steps) ke komponen lucide.
const RULE_ICONS: Record<string, LucideIcon> = {
  ruler: Ruler,
  zone: LayoutGrid,
  hand: Hand,
  fun: Sparkles,
  close: ShieldAlert,
  touch: Ban,
  sensor: WifiOff,
  food: CupSoda,
};

interface CardProps {
  step: InstructionStep;
  onNext: () => void;
  buttonLabel: string;
  // Tombol baru boleh diklik/terlihat saat narasi suara step ini selesai.
  // Default true supaya kartu tanpa gating audio tetap menampilkan tombol.
  buttonReady?: boolean;
}

interface GetReadyCardProps extends CardProps {
  // Durasi sesi (menit) dari paket yang dipilih user. Kalau undefined
  // (mis. session belum termuat) jatuh ke step.sessionDuration sebagai default.
  sessionDurationMinutes?: number;
}

/** Circular ring showing the session duration (mm:00), busur ter-animasi. */
function DurationRing({ minutes }: { minutes: number }) {
  const size = 260;
  const stroke = 13;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  // Busur "naik-turun" terus-menerus: offset dianimasikan bolak-balik antara
  // isi rendah (~55%) dan tinggi (~92%) lewat keyframe CSS (bukan sekali di awal).
  const offHigh = c * (1 - 0.92); // paling terisi
  const offLow = c * (1 - 0.55); // paling kosong
  const keyframes = `@keyframes durationRingPulse {
    0%, 100% { stroke-dashoffset: ${offLow}px; }
    50% { stroke-dashoffset: ${offHigh}px; }
  }`;

  return (
    <div
      className="relative flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <style>{keyframes}</style>
      <svg width={size} height={size} className="-rotate-[125deg]">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(249,247,247,0.12)"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#DBE2EF"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offLow}
          style={{ animation: 'durationRingPulse 3s ease-in-out infinite' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[62px] font-bold leading-none text-white tabular-nums">
          {minutes}:00
        </span>
        <span className="mt-3 text-[16px] font-semibold uppercase tracking-[0.35em] text-white/45">
          Duration
        </span>
      </div>
    </div>
  );
}

/** "Get Ready" step — numbered activity list + session duration ring. */
export function GetReadyCard({
  step,
  onNext,
  buttonLabel,
  buttonReady = true,
  sessionDurationMinutes,
}: GetReadyCardProps) {
  const minutes = sessionDurationMinutes ?? step.sessionDuration ?? 5;
  return (
    <GlassCard maxWidth="max-w-[960px]" className="px-14 py-12">
      <div className="flex flex-col items-center">
        <h2 className="mb-14 text-center text-[46px] font-bold leading-tight text-white">
          {step.heading}
        </h2>

        {/* Grup list + ring di-center sebagai satu blok (justify-center) supaya
            margin kiri & kanan simetris; gap-14 mengatur jarak list↔ring. */}
        <div className="flex w-full flex-row items-center justify-center gap-14">
          {/* Kiri — daftar aktivitas bernomor */}
          <div className="flex w-[440px] shrink-0 flex-col gap-4">
            {step.activities?.map((activity, i) => (
              <GlassCard
                key={activity.label}
                variant="secondary"
                className="flex w-full items-center gap-5 rounded-2xl px-6 py-5"
              >
                <span className="flex h-13 w-13 shrink-0 items-center justify-center rounded-full bg-[#F9F7F7]/15 text-[24px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="text-[28px] font-bold leading-8 text-white">
                  {activity.label}
                </span>
              </GlassCard>
            ))}
          </div>

          {/* Kanan — ring durasi sesi */}
          <DurationRing minutes={minutes} />
        </div>

        <Button
          variant="outline"
          onClick={onNext}
          className={cn(
            'mt-14 transition-opacity duration-300',
            !buttonReady && 'opacity-0 pointer-events-none',
          )}
        >
          {buttonLabel}
        </Button>
      </div>
    </GlassCard>
  );
}

/** Satu baris aturan sebagai kartu: kotak ikon + teks. */
function RuleCard({
  text,
  icon,
  tone,
}: {
  text: string;
  icon?: string;
  tone: 'do' | 'dont';
}) {
  const Icon = icon ? RULE_ICONS[icon] : null;
  const isDo = tone === 'do';
  return (
    <GlassCard
      variant="secondary"
      className={cn(
        'flex w-full items-center gap-4 rounded-2xl px-5 py-3.5 border',
        isDo
          ? 'bg-[#3F72AF]/20 border-[#3F72AF]/30'
          : 'bg-[#D62F2F]/15 border-[#D62F2F]/30',
      )}
    >
      <span
        className={cn(
          'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl',
          isDo ? 'bg-[#3F72AF]/35' : 'bg-[#D62F2F]/25',
        )}
      >
        {Icon && (
          <Icon
            size={24}
            className={isDo ? 'text-blue-100' : 'text-red-400'}
          />
        )}
      </span>
      <span className="text-[22px] font-semibold leading-7 text-white">
        {text}
      </span>
    </GlassCard>
  );
}

/** "Safety & Rules" step — Do / Don't columns. */
export function SafetyRulesCard({
  step,
  onNext,
  buttonLabel,
  buttonReady = true,
}: CardProps) {
  return (
    <GlassCard maxWidth="max-w-[1120px]" className="py-8 px-10 overflow-hidden">
      <div className="flex flex-col items-center">
        <h2 className="text-[46px] font-bold text-white leading-tight mb-6">
          {step.heading}
        </h2>

        <div className="grid grid-cols-2 gap-8 lg:gap-10 items-start w-full">
          {/* Do column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-center gap-3 mb-4">
              <ShieldCheck size={28} className="text-blue-100 shrink-0" />
              <span className="text-[26px] font-bold leading-7 text-white">
                Do
              </span>
            </div>
            <div className="flex flex-col gap-3.5">
              {step.doRules?.map((rule, idx) => (
                <RuleCard
                  key={`do-${idx}`}
                  text={rule.text}
                  icon={rule.icon}
                  tone="do"
                />
              ))}
            </div>
          </div>

          {/* Don't column */}
          <div className="flex flex-col">
            <div className="flex items-center justify-center gap-3 mb-4">
              <CircleAlert size={28} className="text-red-400 shrink-0" />
              <span className="text-[26px] font-bold leading-7 text-red-400">
                Don&apos;t
              </span>
            </div>
            <div className="flex flex-col gap-3.5">
              {step.dontRules?.map((rule, idx) => (
                <RuleCard
                  key={`dont-${idx}`}
                  text={rule.text}
                  icon={rule.icon}
                  tone="dont"
                />
              ))}
            </div>
          </div>
        </div>

        {step.guideline && (
          <GlassCard
            variant="secondary"
            maxWidth="max-w-full"
            className="mt-6 w-full flex items-center justify-center gap-5 rounded-2xl px-7 py-5"
          >
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#F9F7F7]/12">
              <Hand size={30} className="text-blue-100" />
            </span>
            <p className="text-white text-[26px] font-medium leading-8 whitespace-nowrap">
              {step.guideline}
            </p>
          </GlassCard>
        )}

        <Button
          variant="outline"
          onClick={onNext}
          className={cn(
            'mt-6 transition-opacity duration-300',
            !buttonReady && 'opacity-0 pointer-events-none',
          )}
        >
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
    }, 1400);
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
                className="relative z-10 w-16 h-12 bg-blue-100 rounded-xl flex items-center justify-center shadow-lg transition-transform duration-[800ms] ease-in-out"
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
                          className={cn(
                            'object-contain',
                            // Preset 6 (Move Left) — gambar diputar 100° ke
                            // kanan supaya jempol menghadap ke atas.
                            gesture.icon?.includes('MOVELEFT') &&
                              'rotate-[100deg]',
                          )}
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

      <div className="flex flex-row items-center gap-8 mt-8">
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
