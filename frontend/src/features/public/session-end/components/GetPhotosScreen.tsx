'use client';

import { Sparkles } from 'lucide-react';
import { useState, useEffect } from 'react';
import Lottie from 'lottie-react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import loadingAnimation from '@/assets/loading.json';
import Timer from '@/components/shared/Timer';

interface GetPhotosScreenProps {
  onComplete: () => void;
  sessionId: string;
}

export function GetPhotosScreen({
  onComplete,
  sessionId,
}: GetPhotosScreenProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [downloadUrl, setDownloadUrl] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setIsLoading(false), 3000);
    return () => clearTimeout(timer);
  }, []);

  // Build the download URL after mount (window is undefined during SSR).
  // Override with NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL if the kiosk is accessed via
  // localhost — set this to the LAN IP/public URL the HP can reach.
  useEffect(() => {
    const base =
      process.env.NEXT_PUBLIC_DOWNLOAD_PUBLIC_URL?.trim() ||
      window.location.origin;
    setDownloadUrl(`${base}/download-photos/${sessionId}`);
  }, [sessionId]);

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-full w-full flex flex-col items-center justify-center gap-4">
        <div className="w-37.5 h-37.5">
          <Lottie animationData={loadingAnimation} loop={true} />
        </div>
        <p className="text-primary/60 text-lg font-medium tracking-wide animate-pulse">
          Processing your photos...
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-full w-full flex flex-col items-center relative overflow-hidden">
      <Timer duration={30} onTimeUp={onComplete} />
      {/* Header */}
      <div className="w-full flex items-center justify-center pt-10 pb-2 relative px-10">
        <div className="text-center">
          <h1 className="text-primary text-[60px] font-bold ">
            Get Your Photos
          </h1>
          <p className="text-primary text-2xl mt-2 leading-6.75">
            Scan the QR code below to download all your photos
          </p>
        </div>

        {/* DEV: Next button instead of timer */}
        {/* {DEV_MODE && (
          <button
            onClick={onComplete}
            className="absolute right-10 top-10 bg-primary/20 hover:bg-primary/30 border border-primary/30 text-primary text-sm font-semibold px-4 py-2 rounded-xl transition-all"
          >
            {formatTime}
          </button>
        )} */}
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center gap-40 px-10 mt-18.75 w-full max-w-5xl">
        {/* Left — Photo strip preview */}
        <div className="relative flex items-center justify-center">
          <Sparkles
            size={28}
            className="text-primary absolute -left-10 top-1/3"
            strokeWidth={1.5}
            fill="currentColor"
          />
          {/* Photo strip */}
          <div className="flex gap-3 -rotate-3">
            <img
              src="/Frame 158.svg"
              alt="Photo strip"
              className="h-130 drop-shadow-xl"
            />
          </div>
        </div>

        {/* Right — QR Code panel + dev link */}
        <div className="flex flex-col items-center gap-3">
          <div className="bg-primary/80 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-w-95 h-100">
            <h2 className="text-white text-xl font-bold">Scan to download</h2>
            <p className="text-white/60 text-xs text-center">
              Point your phone&apos;s camera at this QR code.
            </p>
            <div className="rounded-xl p-3 bg-white">
              {downloadUrl ? (
                <QRCodeSVG
                  value={downloadUrl}
                  size={240}
                  level="M"
                  marginSize={2}
                  aria-label={`QR Code untuk ${downloadUrl}`}
                />
              ) : (
                <div className="w-60 h-60 bg-white/10 rounded animate-pulse" />
              )}
            </div>
          </div>

          {process.env.NODE_ENV === 'development' && (
            <Link
              href={`/download-photos/${sessionId}`}
              className="text-primary/50 underline text-sm hover:text-primary/80 transition-colors"
            >
              Buka Halaman Download (Dev)
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
