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
  activePresetName,
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

  const hint = isMoving
    ? 'Robot is moving to position…'
    : isCooldown
      ? 'Hold still — capturing photo…'
      : isLocked
        ? 'Show open palm (all fingers) to unlock'
        : 'Show a gesture to move the robot';

  return (
    <div
      className={cn(
        'bg-primary/75 border border-white/10 rounded-2xl overflow-hidden shadow-lg flex flex-col h-full',
        className,
      )}
    >
      {/* Video area — MJPEG liveview kamera deteksi tangan (dobot /video_feed) */}
      <div className="relative flex-1 min-h-0 bg-black/40">
        {hasStream ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={`${streamUrl}-${nonce}`}
            src={`${streamUrl}?k=${nonce}`}
            alt="Robot hand-detection camera"
            className="w-full h-full object-cover bg-black"
            style={{ display: 'block' }}
            onError={() => {
              window.setTimeout(() => setNonce((n) => n + 1), 1500);
            }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
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

        {/* Progress bar */}
        <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/10">
          <div
            className="h-full bg-[#00d084] transition-all duration-200 ease-linear"
            style={{ width: `${Math.max(0, Math.min(100, progressPercentage))}%` }}
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
            {statusLabel}
          </span>
          {activePresetName && (isMoving || isCooldown) && (
            <span className="text-xs text-white/40">→ Preset {activePresetName}</span>
          )}
        </div>

        {/* Right: gesture / progress indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-1.5 h-1.5 rounded-full ${
              isLocked ? 'bg-[#d4a373]' : 'bg-[#00d084] animate-pulse'
            }`}
          />
          <span className="text-xs text-white/40">
            {gestureName
              ? gestureName
              : isLocked
                ? 'Waiting..'
                : `${Math.round(progressPercentage)}%`}
          </span>
        </div>
      </div>

      {/* Hint */}
      <div className="px-4 pb-4 -mt-1 shrink-0 flex items-center gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/finger/STOP.svg"
          alt="Open palm"
          className="h-5 w-5 object-contain"
        />
        <p className="text-sm text-[#00d084]/80">{hint}</p>
      </div>
    </div>
  );
}
