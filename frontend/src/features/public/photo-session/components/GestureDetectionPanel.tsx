import { Unlock, Lock } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import type { RobotFsmState } from '../api/getRobotDetection';

interface GestureDetectionPanelProps {
  /** URL stream MJPEG dobot (/video_feed). Null = tidak aktif. */
  streamUrl: string | null;
  /** Robot service terjangkau (poll /detection sukses)? */
  reachable?: boolean;
  fsmState?: RobotFsmState;
  /** Progress safety-unlock (tahan open palm), 0-100. */
  armPercent?: number;
  /** Progress pengenalan gesture preset, 0-100. */
  presetPercent?: number;
  /** Nama gesture yang sedang terdeteksi. */
  gestureName?: string | null;
  /** Preset yang sedang dituju robot (mis. "3"). */
  activePresetName?: string | null;
  /** Class tambahan untuk kontainer luar (mis. override border/frame). */
  className?: string;
}

export function GestureDetectionPanel({
  streamUrl,
  reachable = false,
  fsmState = 'LOCKED',
  armPercent = 0,
  presetPercent = 0,
  gestureName,
  className,
}: GestureDetectionPanelProps) {
  // Bump nonce saat stream error → paksa <img> MJPEG reconnect. streamUrl ikut
  // masuk ke key <img> supaya ganti stream otomatis remount (tanpa reset effect).
  const [nonce, setNonce] = useState(0);

  const isLocked = fsmState === 'LOCKED' || fsmState === 'UNLOCKING';
  const isUnlocked = fsmState === 'UNLOCKED' || fsmState === 'CONFIRMING';
  const isMoving = fsmState === 'MOVING';
  const isCooldown = fsmState === 'COOLDOWN';

  // Bar bawah: fase locked → progress unlock; fase unlocked → progress preset;
  // saat robot bergerak/cooldown → penuh.
  const progressPercentage = isLocked
    ? armPercent
    : isUnlocked
      ? presetPercent
      : 100;

  const hasStream = !!streamUrl && reachable;

  const statusLabel = isMoving
    ? 'Moving'
    : isCooldown
      ? 'Capturing'
      : isLocked
        ? 'Locked'
        : 'Unlocked';

  return (
    <div
      className={cn(
        'relative bg-black/40 border border-white/10 rounded-2xl overflow-hidden shadow-lg h-full',
        className,
      )}
    >
      {/* Video mengisi SELURUH card — status & hint di-overlay di atasnya
          (bukan bar terpisah) supaya tidak ada blok solid yang terpisah dari
          video. */}
      {hasStream ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={`${streamUrl}-${nonce}`}
          src={`${streamUrl}?k=${nonce}`}
          alt="Robot hand-detection camera"
          className="absolute inset-0 w-full h-full object-cover bg-black"
          onError={() => {
            window.setTimeout(() => setNonce((n) => n + 1), 1500);
          }}
        />
      ) : (
        <div className="absolute inset-0 flex items-center justify-center">
          <p className="text-white/30 text-xs">
            {reachable ? 'Stream not available' : 'Robot camera offline'}
          </p>
        </div>
      )}

      {/* Overlay saat robot bergerak */}
      {(isMoving || isCooldown) && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <span className="text-white text-lg font-medium tracking-wide">
            {isMoving ? 'Moving to position…' : 'Capturing…'}
          </span>
        </div>
      )}

      {/* Overlay bawah: scrim gradient gelap + status lock (kiri) & indikator
          gesture (kanan) — DIPERBESAR. Hint & progress bar dihilangkan (bar
          detection + info preset kini ada di card Gesture Detection panel kanan). */}
      <div className="absolute inset-x-0 bottom-0 flex items-center justify-between gap-3 bg-gradient-to-t from-black/80 via-black/45 to-transparent px-7 pt-20 pb-6">
        {/* Status lock */}
        <div className="flex items-center gap-3.5">
          {isLocked ? (
            <Lock size={38} className="text-[#e8b98f]" strokeWidth={2.5} />
          ) : (
            <Unlock size={38} className="text-white" strokeWidth={2.5} />
          )}
          <span
            className={`text-5xl font-bold tracking-wide ${
              isLocked ? 'text-[#e8b98f]' : 'text-white'
            }`}
          >
            {statusLabel}
          </span>
        </div>

        {/* Indikator gesture / progress */}
        <div className="flex items-center gap-3">
          <div
            className={`w-3.5 h-3.5 rounded-full ${
              isLocked ? 'bg-[#e8b98f]' : 'bg-[#00d084] animate-pulse'
            }`}
          />
          <span className="text-3xl font-semibold text-white">
            {gestureName
              ? gestureName
              : isLocked
                ? 'Waiting…'
                : `${Math.round(progressPercentage)}%`}
          </span>
        </div>
      </div>
    </div>
  );
}
