'use client';

import { SessionHeader } from '../components/SessionHeader';
import { CameraPreview } from '../components/CameraPreview';
import EndSessionButton from '../components/EndSessionButton';
import GestureGuide from '../components/GestureGuide';
import { useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { useGetSession } from '@/shared/api/session';
import { sendSessionBroadcast } from '../lib/broadcastChannel';
import { useLiveStream } from '../api/getLivePreview';
import { useRobotConfig } from '../api/getRobotConfig';
import { apiClient } from '@/lib/api-client';
import { playBackendAudio } from '@/lib/audio';
import { usePersistedCountdown } from '@/lib/usePersistedCountdown';

// Hard cap untuk grace period setelah timer 0: kalau robot stuck atau webhook
// /done tidak fire, paksa end sesi setelah ini supaya kiosk tidak hang.
const MAX_GRACE_SEC = 30;

export function PhotoSessionPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const sessionId = searchParams.get('sessionId') ?? '';

  useEffect(() => {
    if (!sessionId) router.replace('/package');
  }, [sessionId, router]);

  // Play inisiasi.mp3 sekali saat halaman foto terbuka
  useEffect(() => {
    if (sessionId) playBackendAudio('inisiasi.mp3');
  }, [sessionId]);

  const { data: session, isFetching: isSessionFetching } = useGetSession({
    sessionId,
    queryConfig: { enabled: !!sessionId },
  });

  // Enable robot TEPAT saat masuk sesi foto (halaman kamera tampil). Fire
  // sekali; gate pada sesi valid agar sesi pending/expired yang akan di-redirect
  // tidak ikut menyalakan robot. Disable-nya ada di end-effect di bawah, jadi
  // enable↔disable seimbang dan dimiliki oleh halaman yang sama.
  const enableFiredRef = useRef(false);
  useEffect(() => {
    if (!sessionId || isSessionFetching || !session) return;
    if (session.status === 'pending_payment' || session.status === 'expired')
      return;
    if (enableFiredRef.current) return;
    enableFiredRef.current = true;

    apiClient.post('/api/robot/enable').catch((err) => {
      console.warn('[PhotoSession] robot/enable failed:', err);
    });
  }, [sessionId, session, isSessionFetching]);

  // Guard: sesi belum dibayar / kedaluwarsa tidak boleh masuk sesi foto.
  // Tunggu data FRESH (jangan bertindak saat fetching) agar cache 'pending_payment'
  // lama tepat setelah bayar tidak salah me-redirect user. Backend juga menolak
  // transisi ke 'shooting' tanpa 'paid' sebagai batas keamanan sebenarnya.
  useEffect(() => {
    if (isSessionFetching) return;
    if (session?.status === 'pending_payment' || session?.status === 'expired') {
      router.replace('/package');
    }
  }, [session?.status, isSessionFetching, router]);

  // Timer durasi sesi dari package — kalau halaman di-refresh sisa waktu
  // dihitung dari awal sesi (bukan reset). Key null saat session belum load
  // agar storage tidak ditulis dengan durasi fallback yang salah.
  const sessionDuration = session?.durationSecs;
  const { timeLeft: sessionTimeLeft, clear: clearSessionTimer } =
    usePersistedCountdown(
      sessionId && sessionDuration != null ? `photo-session:${sessionId}` : null,
      sessionDuration ?? 300,
    );
  // Pastikan blok "session end" (broadcast + disable robot + navigate) cuma
  // fire SEKALI walaupun effect re-run akibat dep `session` (dari useGetSession)
  // refresh/refetch saat sessionTimeLeft sudah 0.
  const endFiredRef = useRef(false);
  const {
    frameUrl,
    hasError,
    errorMessage,
    handleStreamError,
    retryStream,
  } = useLiveStream();

  // Track robot state untuk safeguard: jangan akhiri sesi kalau robot masih
  // gerak / countdown shutter masih berjalan — biar foto terakhir tidak
  // ke-cut di tengah jepretan. Polling 250ms (di-share dengan CameraPreview
  // via React Query, single underlying request).
  //
  // `isFetched` jadi true setelah request pertama RESOLVES (success/error).
  // Dipakai untuk menahan end-effect di edge case "refresh tepat saat
  // sessionTimeLeft sudah 0" — kalau tidak, robotConfig masih undefined
  // → robotBusy=false → end fire tanpa kasih kesempatan grace check.
  const { data: robotConfig, isFetched: robotConfigFetched } = useRobotConfig();
  const robotBusy =
    (robotConfig?.current_preset ?? 0) > 0 ||
    robotConfig?.auto_capture_active === true;
  // Grace counter (detik) saat sessionTimeLeft sudah 0 tapi robot masih busy.
  // Dipakai untuk tampilkan timer negatif (-1, -2, ...) sebagai indikator
  // sesi diperpanjang sementara untuk merampungkan foto.
  const [graceSeconds, setGraceSeconds] = useState(0);

  // User menekan "Selesai sekarang" → percepat alur dengan men-trigger jalur
  // akhir sesi yang sama (broadcast + disable robot + navigate), termasuk
  // safeguard robot-busy & grace. Jadi end bisa terpicu oleh timer ATAU ini.
  const [endRequested, setEndRequested] = useState(false);
  // "Sedang menuju akhir sesi" — timer habis atau user minta selesai. Dipakai
  // untuk state tombol (disabled + label "Menyelesaikan foto…").
  const endingNow = endRequested || sessionTimeLeft === 0;

  // Grace tick: hanya jalan saat sessionTimeLeft sudah 0 DAN robot masih
  // busy. Mulai dari 1 supaya tampilan langsung "-00:01" tanpa nampung
  // "00:00" sesaat.
  useEffect(() => {
    if (!endingNow || !robotBusy) {
      setGraceSeconds(0);
      return;
    }
    setGraceSeconds(1);
    const id = setInterval(() => {
      setGraceSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [endingNow, robotBusy]);

  const graceExpired = graceSeconds >= MAX_GRACE_SEC;
  const inGrace = endingNow && robotBusy && !graceExpired;
  // Timer yang ditampilkan: negatif saat overtime (menunggu foto selesai).
  const displayTimeLeft = inGrace ? -graceSeconds : sessionTimeLeft;

  // Visibilitas overlay bawah:
  // - presetDetected: ada gesture aktif (robot busy) saat sesi masih berjalan.
  //   Saat ini panduan & tombol disembunyikan supaya layar bersih ("hilang"),
  //   lalu muncul lagi ketika gesture dilepas ("ada").
  // - Tombol "Selesai" tetap tampil saat proses akhir sesi berjalan (endingNow)
  //   untuk menampilkan status "Menyelesaikan foto…".
  const presetDetected = robotBusy && !endingNow;
  const showGuide = !presetDetected && !endingNow;
  const showEndButton = !presetDetected;

  useEffect(() => {
    if (!endingNow || !sessionId) return;
    // Tunggu first poll selesai dulu sebelum decide — kalau tidak, robotBusy
    // bisa false hanya karena query masih loading, dan kita lewatkan grace
    // check (mis. user refresh tepat saat sessionTimeLeft sudah 0).
    if (!robotConfigFetched) return;
    // Tahan end sesi selama robot masih sibuk (sampai grace hard-cap).
    if (robotBusy && !graceExpired) return;
    if (endFiredRef.current) return;
    endFiredRef.current = true;

    sendSessionBroadcast({ type: 'SESSION_END', sessionId });

    // Sesi selesai → bersihkan entri timer di sessionStorage
    clearSessionTimer();

    // Sesi selesai → matikan robot
    apiClient.post('/api/robot/disable').catch((err) => {
      console.warn('[PhotoSession] robot/disable failed:', err);
    });

    const isPrint = session?.packageCode === 'vip';
    const target = isPrint
      ? `/photo-editor?sessionId=${sessionId}`
      : `/session-end?sessionId=${sessionId}`;

    const timeout = setTimeout(() => {
      // VIP: photo-editor dulu untuk pilih frame + foto, lalu session-end.
      // Digital: langsung session-end (tampil QR untuk scan di HP).
      router.push(target);
    }, 1000);

    return () => clearTimeout(timeout);
  }, [
    endingNow,
    sessionId,
    session,
    router,
    clearSessionTimer,
    robotBusy,
    graceExpired,
    robotConfigFetched,
  ]);

  if (!sessionId) return null;

  return (
    // Kiosk fullscreen: pakai `fixed inset-0` agar halaman menempel ke viewport
    // dan LEPAS dari container `max-w-360 mx-auto` layout publik (kalau ikut
    // container, bar + preview terkunci 1440px di tengah pada layar lebar).
    // Fixed juga out-of-flow → tidak memicu scroll horizontal di container.
    <div className="fixed inset-0 flex flex-col overflow-hidden">
      <div className="px-10 pt-6 shrink-0">
        <SessionHeader sessionTimeLeft={displayTimeLeft} />
      </div>

      <main className="flex flex-1 min-h-0 px-10 pb-6 pt-3">
        <div className="flex-1 flex flex-col gap-3 min-h-0">
          <h2 className="text-primary font-medium text-2xl tracking-[0.47px] shrink-0 text-left">
            Preview Camera
          </h2>
          <div className="relative flex-1 min-h-0">
            <CameraPreview
              frameUrl={frameUrl}
              sessionId={sessionId}
              hasError={hasError}
              errorMessage={errorMessage}
              onError={handleStreamError}
              onRetry={retryStream}
            />

            {/* "Selesai sekarang" — melayang di pojok kanan-atas preview, diberi
                inset (top/right-6) supaya tidak terlihat nempel ke tepi frame.
                Disembunyikan saat preset terdeteksi (kecuali saat proses akhir
                sesi berjalan). */}
            {showEndButton && (
              <div className="absolute right-6 top-6 z-40">
                <EndSessionButton
                  onEnd={() => setEndRequested(true)}
                  ending={endingNow}
                />
              </div>
            )}

            {/* Panduan gesture preset 1–10 — ikon melayang di dalam preview,
                inset bottom/x-6 supaya jaraknya simetris dengan tombol atas
                (tidak nempel ke tepi bawah). pointer-events-none agar area
                kamera tidak terblokir. Sembunyi saat preset terdeteksi. */}
            {showGuide && (
              <div className="pointer-events-none absolute inset-x-6 bottom-6 z-40">
                <GestureGuide />
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
