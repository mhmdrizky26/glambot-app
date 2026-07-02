'use client';

import { Sparkles } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import Lottie from 'lottie-react';
import Link from 'next/link';
import { QRCodeSVG } from 'qrcode.react';
import loadingAnimation from '@/assets/loading.json';
import Timer from '@/components/shared/Timer';
import { useDriveLink } from '@/features/public/photo-download/api/getDriveLink';
import { useLiveGifAvailability } from '@/features/public/photo-download/api/getGifAvailability';
import { GIFPreview } from '@/features/public/photo-download/components/GIFPreview';
import { useFramedPhotos } from '@/features/public/photo-editor/api/getPhotos';
import { useAppConfig } from '@/shared/api/config';
import { playBackendAudio, playBackendAudioAfterCurrent } from '@/lib/audio';

interface GetPhotosScreenProps {
  onComplete: () => void;
  sessionId: string;
}

export function GetPhotosScreen({
  onComplete,
  sessionId,
}: GetPhotosScreenProps) {
  const [downloadUrl, setDownloadUrl] = useState('');
  const { data: appConfig } = useAppConfig();

  // Splash minimum supaya loading tidak berkedip sekejap.
  const [minSplashDone, setMinSplashDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMinSplashDone(true), 1500);
    return () => clearTimeout(t);
  }, []);

  // Narasi "sedang memproses foto" — main sekali saat layar ini muncul (fase
  // loading, sebelum QR siap). scanQrAmbilFoto di bawah menyusul setelah ini.
  useEffect(() => {
    playBackendAudio('prosesFoto.mp3');
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

  // Link folder Google Drive (kalau fitur aktif). Saat aktif, QR diarahkan ke
  // folder Drive publik — bisa dibuka dari mana saja, tidak bergantung LAN.
  const { data: drive } = useDriveLink({ sessionId });
  const driveActive = drive?.enabled === true;
  const driveReady = drive?.ready === true;

  // Strip preview: pakai hasil sesi yang sebenarnya, bukan gambar statis.
  // Prioritas: Live Strip GIF (animasi, paling menarik) → strip framed final →
  // fallback ke ilustrasi statis kalau keduanya belum ada.
  const { data: framedPhotos } = useFramedPhotos({ sessionId });
  const { data: liveGifAvailability } = useLiveGifAvailability({ sessionId });
  const framedStrip = framedPhotos?.[0];
  const isLiveStripAvailable = liveGifAvailability?.available ?? false;

  // Batas aman: kalau link Drive belum siap setelah 45 detik (mis. upload gagal
  // / sangat lambat), jangan biarkan loading menggantung — lanjut ke QR dengan
  // fallback URL download lokal. Start saat mount supaya juga mencakup periode
  // saat status Drive masih belum diketahui.
  const [driveTimedOut, setDriveTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setDriveTimedOut(true), 45000);
    return () => clearTimeout(t);
  }, []);

  // Tahan di loading SELAMA link Drive belum siap (atau status belum diketahui),
  // supaya QR yang akhirnya muncul DIJAMIN sudah berisi URL Drive — scan QR
  // langsung membuka folder Drive, bukan QR kosong/menyusul.
  const driveMaybeActive = drive === undefined || drive.enabled === true;
  const waitingForDrive = driveMaybeActive && !driveReady && !driveTimedOut;
  const isLoading = !minSplashDone || waitingForDrive;

  // Suara "scan QR untuk ambil foto" — main sekali saat loading selesai & QR
  // tampil (deklarasi sebelum early-return loading, patuh Rules of Hooks).
  const qrAudioFiredRef = useRef(false);
  useEffect(() => {
    if (!isLoading && !qrAudioFiredRef.current) {
      qrAudioFiredRef.current = true;
      // Tunggu "prosesFoto" selesai dulu supaya tidak menabrak.
      playBackendAudioAfterCurrent('scanQrAmbilFoto.mp3');
    }
  }, [isLoading]);

  // Nilai QR: link Drive kalau aktif & siap; kalau timeout tanpa siap atau Drive
  // tidak aktif, pakai URL halaman download lokal sebagai cadangan.
  const useDrive = driveActive && (driveReady || !driveTimedOut);
  const qrValue = useDrive ? (drive?.url ?? '') : downloadUrl;
  const isPreparing = useDrive && !driveReady;

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
      {appConfig && (
        <Timer
          duration={appConfig.getPhotosTimeoutSecs}
          onTimeUp={onComplete}
          storageKey={`get-photos:${sessionId}`}
        />
      )}
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
      <div className="flex-1 flex items-center justify-center gap-40 px-10 w-full max-w-5xl">
        {/* Left — Photo strip preview */}
        <div className="relative flex items-center justify-center">
          <Sparkles
            size={28}
            className="text-primary absolute -left-10 top-1/3"
            strokeWidth={1.5}
            fill="currentColor"
          />
          {/* Photo strip — hasil sesi nyata (live strip / framed), bukan statis */}
          <div className="w-90 -rotate-3 drop-shadow-xl">
            {isLiveStripAvailable ? (
              <GIFPreview
                endpoint={`/api/photo/session/${sessionId}/gif-live`}
                alt="Your live photo strip"
                aspectClass="aspect-[464/696]"
              />
            ) : framedStrip ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={framedStrip.url}
                alt="Your photo strip"
                className="w-full rounded-xl"
              />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src="/Frame 158.svg" alt="Photo strip" className="w-full" />
            )}
          </div>
        </div>

        {/* Right — QR Code panel + dev link */}
        <div className="flex flex-col items-center gap-3">
          <div className="bg-primary/80 backdrop-blur-xl rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-w-95 h-100">
            <h2 className="text-white text-xl font-bold">Scan to download</h2>
            <p className="text-white/60 text-xs text-center">
              {isPreparing
                ? 'Preparing Google Drive link...'
                : "Point your phone's camera at this QR code."}
            </p>
            <div className="rounded-xl p-3 bg-white">
              {qrValue ? (
                <QRCodeSVG
                  value={qrValue}
                  size={240}
                  level="M"
                  marginSize={2}
                  aria-label={`QR Code for ${qrValue}`}
                />
              ) : (
                <div className="w-60 h-60 bg-white/10 rounded animate-pulse" />
              )}
            </div>
          </div>

          {/* Link ke halaman download (alternatif kalau tidak scan QR). */}
          <Link
            href={`/download-photos/${sessionId}`}
            className="text-primary underline text-sm font-medium hover:text-primary/70 transition-colors"
          >
            Open Download Page
          </Link>
        </div>
      </div>
    </div>
  );
}
