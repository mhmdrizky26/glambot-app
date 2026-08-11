'use client';

import { useState, useEffect, useRef } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  ChevronRight,
  ChevronLeft,
  LayoutTemplate,
  Hand,
  ZoomIn,
  Sparkles,
  CheckCircle2,
  RotateCw,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import GlassCard from '@/components/shared/GlassCard';
import { playBackendAudio, stopBackendAudioFile } from '@/lib/audio';
import { cn } from '@/lib/utils';

interface PhotoEditorOnboardingProps {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * Jeda diam sebelum step tutorial pindah sendiri, dihitung sejak tombol
 * "Lanjut" muncul (narasi step selesai). Berlaku untuk SEMUA step — di step
 * terakhir artinya tutorial menutup sendiri, jadi intro bisa jalan sampai
 * habis tanpa disentuh sama sekali. Menyentuh dialog mengulang hitungan.
 */
const AUTO_NEXT_MS = 5000;

// `audio` = narasi yang diputar saat step tampil (satu file per step).
const STEPS = [
  {
    id: 1,
    title: '1. Pilih Layout Frame',
    description: 'Pilih template frame yang kamu suka di panel sebelah kanan.',
    icon: LayoutTemplate,
    panelName: 'Panel Frame',
    audio: 'sentuhFrame.mp3',
  },
  {
    id: 2,
    title: '2. Taruh Foto ke Slot',
    description: 'Seret foto dari panel kiri, atau tap untuk menaruhnya ke slot. Mau ganti foto? Cukup jatuhkan foto baru di atasnya.',
    icon: Hand,
    panelName: 'Panel Foto',
    audio: 'seretFoto.mp3',
  },
  {
    id: 3,
    title: '3. Atur & Zoom Langsung',
    description: 'Tap slot fotonya langsung. Geser dengan 1 jari untuk menggeser, atau cubit dengan 2 jari untuk zoom.',
    icon: ZoomIn,
    panelName: 'Sentuh Langsung',
    audio: 'seretZoom.mp3',
  },
  {
    id: 4,
    title: '4. Pilih Filter Warna',
    description: 'Buka tab Filter di panel kanan untuk memilih warna buat photo strip-mu.',
    icon: Sparkles,
    panelName: 'Tab Filter',
    audio: 'filter.mp3',
  },
  {
    id: 5,
    title: '5. Cetak Hasilnya',
    description: 'Kalau semua slot sudah terisi, tap tombol Cetak Sekarang di kanan bawah!',
    icon: Sparkles,
    panelName: 'Cetak Sekarang',
    audio: 'pilihCetakFoto.mp3',
  },
];

export default function PhotoEditorOnboarding({
  isOpen,
  onClose,
}: PhotoEditorOnboardingProps) {
  const [currentStep, setCurrentStep] = useState(0);
  // Tombol Next baru muncul setelah narasi step ini selesai — user menyimak
  // dulu, sama seperti gating di halaman instruksi.
  const [audioDone, setAudioDone] = useState(false);
  // Putaran pertama (yang muncul otomatis saat editor terbuka) wajib disimak:
  // tidak ada tombol Skip dan dialog tidak bisa ditutup dari luar. Skip baru
  // tersedia kalau user membuka ulang tutorial lewat tombol bantuan.
  const [replay, setReplay] = useState(false);
  // Dinaikkan tiap dialog disentuh — dipakai HANYA sebagai pemicu ulang
  // hitungan auto-lanjut (nilainya sendiri tidak dibaca).
  const [touchNonce, setTouchNonce] = useState(0);

  // Tutorial dibuka ulang → mulai lagi dari step 1. Disetel saat render (pola
  // "adjust state on prop change") supaya effect narasi di bawah langsung
  // melihat step 0 — kalau lewat effect, narasi step terakhir sempat bunyi
  // sekejap sebelum ke-reset.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    if (isOpen) setCurrentStep(0);
  }

  // Sekali tutorial ditutup (Skip / "Paham! Mulai Edit"), bukaan berikutnya
  // dianggap replay → Skip boleh muncul.
  // Didefinisikan SEBELUM effect di bawah karena auto-lanjut memakainya untuk
  // menutup tutorial di step terakhir.
  const closeTutorial = () => {
    // Skip di tengah narasi → suaranya ikut berhenti, jangan menyusul di
    // editor. Disapu seluruh clip tutorial (murah, dan tidak bergantung pada
    // step mana yang terakhir diputar); narasi di luar tutorial — mis.
    // peringatan waktu editor — sengaja tidak ikut dihentikan.
    STEPS.forEach((s) => stopBackendAudioFile(s.audio));
    setReplay(true);
    onClose();
  };

  // `closeTutorial` ditahan di ref supaya effect auto-lanjut tidak perlu
  // memasukkannya ke deps. `onClose` dari parent adalah arrow inline yang
  // identitasnya berubah TIAP parent re-render (PhotoEditorPage sering
  // re-render karena timer & state kanvas) — kalau ikut deps, hitungan 5 detik
  // ter-reset terus dan auto-lanjut tidak akan pernah kejadian.
  const closeTutorialRef = useRef(closeTutorial);
  useEffect(() => {
    closeTutorialRef.current = closeTutorial;
  });

  // Narasi per step — diputar saat tutorial dibuka dan tiap kali step berganti
  // (termasuk lompat lewat dot). Satu channel: step baru menghentikan narasi
  // step sebelumnya, jadi user yang menekan Next cepat tidak dengar dua suara.
  useEffect(() => {
    if (!isOpen) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- tutup tombol Next tiap ganti step, lalu buka lagi saat narasinya habis.
    setAudioDone(false);
    const file = STEPS[currentStep]?.audio;
    if (!file) {
      setAudioDone(true);
      return;
    }
    let cancelled = false;
    playBackendAudio(file, () => {
      if (!cancelled) setAudioDone(true);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentStep]);

  // Auto-lanjut SEMUA step. Hitungan mulai saat `audioDone` naik (tombol
  // "Lanjut" muncul) dan dibersihkan sendiri kalau step berganti duluan —
  // entah karena user menekan tombol, menekan dot navigasi, atau auto-lanjut
  // ini sendiri. `touchNonce` di deps membuat sentuhan apa pun pada dialog
  // mengulang hitungan dari nol, jadi user yang sedang menyimak tidak
  // ditinggal pindah.
  //
  // Berbeda dengan halaman intro/instruksi: di sini step TERAKHIR ikut
  // auto-lanjut, dan itu berarti tutorial menutup diri. Aman karena menutup
  // tutorial hanya membuka editor foto — tidak memulai apa pun seperti tombol
  // "Ayo Mulai" yang menjalankan robot.
  useEffect(() => {
    if (!isOpen || !audioDone) return;

    const id = window.setTimeout(() => {
      if (currentStep < STEPS.length - 1) {
        setCurrentStep((prev) => prev + 1);
      } else {
        closeTutorialRef.current();
      }
    }, AUTO_NEXT_MS);

    return () => window.clearTimeout(id);
  }, [isOpen, audioDone, currentStep, touchNonce]);

  if (!isOpen) return null;

  const step = STEPS[currentStep];
  const totalSteps = STEPS.length;

  const handleNext = () => {
    if (currentStep < totalSteps - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      closeTutorial();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  return (
    <Dialog.Root
      open={isOpen}
      onOpenChange={(open) => !open && closeTutorial()}
    >
      <Dialog.Portal>
        {/* Backdrop Overlay */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm transition-opacity" />

        {/* Dialog Content Container */}
        <Dialog.Content
          asChild
          className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-4xl p-0 outline-none"
          // Putaran pertama: tap di luar / Escape tidak menutup tutorial —
          // tanpa ini "tidak ada tombol Skip" gampang dilewati dengan menyentuh
          // backdrop-nya saja.
          onInteractOutside={(e) => {
            if (!replay) e.preventDefault();
          }}
          onEscapeKeyDown={(e) => {
            if (!replay) e.preventDefault();
          }}
        >
          <GlassCard
            variant="default"
            className="overflow-hidden border-2 border-white/75 shadow-[0px_5.38px_26.92px_0px_rgba(17,45,78,0.5)] rounded-[28px] flex flex-col bg-primary"
          >
            <article
              className="flex flex-col w-full text-white"
              // User masih aktif → tunda auto-lanjut, hitung 5 detik dari awal.
              onTouchStart={() => setTouchNonce((n) => n + 1)}
            >
              {/* Header */}
              <header className="flex items-center justify-between px-8 py-5 border-b border-white/15 bg-[#112D4E]">
                <div className="flex items-center gap-3.5">
                  <span className="p-2.5 rounded-xl bg-white/10 text-white border border-white/20">
                    <step.icon className="w-6 h-6" />
                  </span>
                  <div>
                    <Dialog.Title className="text-lg font-bold tracking-tight text-white flex items-center gap-2.5">
                      <span>{step.title}</span>
                      <span className="text-xs px-3 py-0.5 rounded-full bg-[#3F72AF]/40 text-[#DBE2EF] border border-[#3F72AF]/60 font-semibold">
                        {step.panelName}
                      </span>
                    </Dialog.Title>
                    <Dialog.Description className="text-sm font-medium text-[#DBE2EF]/80">
                      Langkah {currentStep + 1} dari {totalSteps}
                    </Dialog.Description>
                  </div>
                </div>

                {/* Skip Button (No icon) — hanya saat tutorial dibuka ulang;
                    putaran pertama wajib dijalani sampai selesai. */}
                {replay && (
                  <Dialog.Close asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 px-5 text-sm font-bold hover:bg-white/20 border-white/40 text-white rounded-full transition-all"
                    >
                      <span>Lewati</span>
                    </Button>
                  </Dialog.Close>
                )}
              </header>

              {/* Main Visual Animation Section */}
              <section className="p-8 flex flex-col items-center text-center gap-6 bg-[#112D4E]">
                {/* Visual Canvas Mockup mirroring the actual 3-panel Photo Editor page */}
                <figure className="w-full h-80 rounded-2xl bg-[#0e243f] border border-white/20 relative overflow-hidden flex flex-col p-4">
                  {/* 3 Main Panels Row */}
                  <div className="flex-1 flex gap-3 min-h-0 relative">
                    {/* Panel Left: Photo Selection */}
                    <div
                      className={`w-1/4 rounded-xl border p-2 flex flex-col gap-1.5 transition-all ${
                        currentStep === 1
                          ? 'border-[#3F72AF] bg-[#3F72AF]/30 ring-2 ring-[#3F72AF]'
                          : 'border-white/15 bg-white/5 opacity-60'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-[#DBE2EF] uppercase tracking-wider">
                        Photos
                      </div>
                      <div className="grid grid-cols-2 gap-1.5 flex-1">
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #1
                        </div>
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #2
                        </div>
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #3
                        </div>
                        <div className="rounded-md bg-white/10 border border-white/15 flex items-center justify-center font-bold text-xs text-white/80">
                          #4
                        </div>
                      </div>
                    </div>

                    {/* Panel Center: Canvas Preview Area */}
                    <div
                      className={`flex-1 rounded-xl border p-3 flex flex-col items-center justify-center relative transition-all ${
                        currentStep === 2
                          ? 'border-[#3F72AF] bg-[#3F72AF]/20 ring-2 ring-[#3F72AF]'
                          : 'border-white/15 bg-white/5'
                      }`}
                    >
                      <div className="text-[11px] font-bold text-[#DBE2EF] uppercase tracking-wider mb-1">
                        Preview Area
                      </div>

                      {/* Strip Frame Mockup */}
                      <div className="w-24 h-36 rounded-lg border border-white/30 bg-white/10 p-1.5 flex flex-col gap-1.5 relative overflow-hidden">
                        {/* Slot 1 */}
                        <div className="w-full h-1/2 rounded border border-dashed border-[#3F72AF]/70 bg-[#3F72AF]/20 flex items-center justify-center relative overflow-hidden">
                          {currentStep >= 2 && (
                            <div
                              className="w-full h-full bg-[#3F72AF]/60 border border-white/30 flex items-center justify-center font-bold text-xs relative text-white"
                              style={
                                currentStep === 2
                                  ? { animation: 'panZoomDemo 4s ease-in-out infinite' }
                                  : {}
                              }
                            >
                              <span>Foto</span>

                              {/* STEP 3 ANIMATION: Pinch & Drag gesture indicators */}
                              {currentStep === 2 && (
                                <>
                                  {/* Finger 1 */}
                                  <div className="absolute left-2 top-2 animate-bounce text-white drop-shadow">
                                    <Hand className="w-4 h-4 -rotate-45 text-white" />
                                  </div>
                                  {/* Finger 2 for Pinch */}
                                  <div
                                    className="absolute right-2 bottom-2 animate-bounce text-white drop-shadow"
                                    style={{ animationDelay: '0.2s' }}
                                  >
                                    <Hand className="w-4 h-4 rotate-135 text-white" />
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Slot 2 */}
                        <div className="w-full h-1/2 rounded border border-dashed border-[#3F72AF]/70 bg-[#3F72AF]/20 flex items-center justify-center">
                          {currentStep >= 4 ? (
                            <div className="w-full h-full bg-[#3F72AF]/60 border border-white/30 flex items-center justify-center text-xs font-bold text-white">
                              <span>Foto</span>
                            </div>
                          ) : (
                            <span className="text-xs font-semibold text-white/50">Slot 2</span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Panel Right: Frame & Filter Selection */}
                    <div
                      className={`w-1/4 rounded-xl border p-2 flex flex-col gap-1.5 transition-all ${
                        currentStep === 0 || currentStep === 3
                          ? 'border-[#3F72AF] bg-[#3F72AF]/30 ring-2 ring-[#3F72AF]'
                          : 'border-white/15 bg-white/5 opacity-60'
                      }`}
                    >
                      {/* Tabs Mockup */}
                      <div className="flex border-b border-white/20 text-xs font-bold text-center">
                        <div
                          className={`flex-1 py-1 ${
                            currentStep !== 3 ? 'text-white border-b-2 border-[#3F72AF]' : 'text-white/40'
                          }`}
                        >
                          Frame
                        </div>
                        <div
                          className={`flex-1 py-1 ${
                            currentStep === 3 ? 'text-white border-b-2 border-[#3F72AF]' : 'text-white/40'
                          }`}
                        >
                          Filter
                        </div>
                      </div>

                      {/* Tab Content Mockup */}
                      {currentStep !== 3 ? (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <div className="h-7 rounded-md bg-white/10 border border-white/15" />
                          <div className="h-7 rounded-md bg-[#3F72AF] border-2 border-white/40" />
                          <div className="h-7 rounded-md bg-white/10 border border-white/15" />
                        </div>
                      ) : (
                        <div className="flex flex-col gap-1.5 mt-1">
                          <div className="h-7 rounded-md bg-[#3F72AF] border-2 border-white/40 text-xs flex items-center justify-center font-bold text-white">Hangat</div>
                          <div className="h-7 rounded-md bg-white/10 border border-white/15 text-xs flex items-center justify-center text-white/70">Sejuk</div>
                        </div>
                      )}
                    </div>

                    {/* ANIMATION OVERLAYS ACCORDING TO STEP */}
                    {/* STEP 1: Hand tapping Frame Panel */}
                    {currentStep === 0 && (
                      <div className="absolute right-8 top-12 animate-bounce text-white drop-shadow">
                        <Hand className="w-7 h-7 -rotate-45" />
                      </div>
                    )}

                    {/* STEP 2: Dragging Photo from Left Panel to Center Slot */}
                    {currentStep === 1 && (
                      <div
                        className="absolute left-8 top-1/3 w-12 h-14 rounded-lg bg-[#3F72AF] border border-white/50 shadow-md flex items-center justify-center pointer-events-none z-20"
                        style={{ animation: 'dragPhotoDemo 3.2s ease-in-out infinite' }}
                      >
                        <Hand className="w-5 h-5 text-white absolute -bottom-2 -right-2 drop-shadow" />
                      </div>
                    )}
                  </div>

                  {/* Bottom Row Mockup: Slot Toolbar + Confirm Print */}
                  <div className="w-full flex items-center justify-between pt-2.5 border-t border-white/10 mt-2.5 shrink-0">
                    <div className="w-1/4" />

                    {/* Center Toolbar Mockup */}
                    <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-primary/80 border border-white/30 text-xs font-semibold text-white/80">
                      <span className="flex items-center gap-1"><ZoomIn className="w-3 h-3" /> Zoom</span>
                      <span className="flex items-center gap-1"><RotateCw className="w-3 h-3" /> Putar</span>
                      <span className="flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Reset</span>
                    </div>

                    {/* Right Confirm Print Button Mockup (No icon) */}
                    <div className="w-1/4 flex justify-end">
                      <div
                        className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center justify-center transition-all ${
                          currentStep === 4
                            ? 'bg-blue-100/34 text-white border-2 border-white/80 scale-105 shadow-md'
                            : 'bg-white/10 text-white/40 border border-white/15'
                        }`}
                      >
                        <span>Cetak Sekarang</span>
                      </div>
                    </div>
                  </div>
                </figure>

                {/* Step Title & Description */}
                <figcaption className="flex flex-col gap-2 max-w-xl">
                  <h3 className="text-2xl font-bold tracking-tight text-white flex items-center justify-center gap-2">
                    <span>{step.title}</span>
                    {currentStep === 4 && <CheckCircle2 className="w-6 h-6 text-emerald-400" />}
                  </h3>
                  <p className="text-base font-normal text-[#DBE2EF] leading-relaxed">
                    {step.description}
                  </p>
                </figcaption>
              </section>

              {/* Footer Navigation */}
              <footer className="px-8 py-5 bg-[#112D4E] border-t border-white/15 flex items-center justify-between">
                {/* Back button using shadcn Button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrev}
                  disabled={currentStep === 0}
                  className="h-10 px-5 text-sm font-bold gap-1 border-white/40 text-white hover:bg-white/10 disabled:opacity-30 rounded-full"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>Kembali</span>
                </Button>

                {/* Navigation Step Dots */}
                <nav className="flex items-center gap-2.5" aria-label="Progres panduan">
                  {STEPS.map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentStep(idx)}
                      className={`h-3 rounded-full transition-all cursor-pointer ${
                        idx === currentStep
                          ? 'w-8 bg-[#3F72AF] border border-white/50'
                          : 'w-3 bg-white/25 hover:bg-white/40'
                      }`}
                      aria-label={`Go to step ${idx + 1}`}
                    />
                  ))}
                </nav>

                {/* Next / Got It button using shadcn Button */}
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleNext}
                  className={cn(
                    'h-10 px-6 text-sm font-bold gap-1.5 shadow-md rounded-full transition-opacity duration-300',
                    // Ditahan (bukan cuma diredupkan) sampai narasi step ini
                    // habis — ruangnya tetap dipesan supaya footer tidak lompat.
                    !audioDone && 'opacity-0 pointer-events-none',
                  )}
                >
                  <span>{currentStep === totalSteps - 1 ? 'Paham! Mulai Edit' : 'Lanjut'}</span>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </footer>
            </article>
          </GlassCard>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
