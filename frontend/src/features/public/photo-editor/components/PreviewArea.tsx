'use client';

import { useEffect, useCallback, useState, useRef } from 'react';
import { fabric } from 'fabric';
import type { Frame, FrameSlot } from '../api/getFrames';
import type { FilterType } from '../pages/PhotoEditorPage';
import { useCanvasRenderer } from '../hooks/useCanvasRenderer';
import {
  loadFrameImage,
  removePhotoBySlotId,
  organizeCanvasLayers,
} from '../lib/fabricCanvas';
import { fitPhotoToSlot } from '../lib/photoFitting';
import { applyFilterToComposition } from '../lib/filters';
import { clampPhotoToSlot } from '../lib/slotTransform';

/** Fallback canvas dimensions bila frame tidak menyimpan ukuran (2:3, 4R). */
const DEFAULT_CANVAS_W = 464;
const DEFAULT_CANVAS_H = 696;

interface PreviewAreaProps {
  selectedFrame: Frame | null;
  selectedFilter: FilterType;
  onPhotoDropped?: (slotId: string, photoId: string, photoUrl: string) => void;
  onCanvasReady?: (canvas: fabric.Canvas) => void;
  // Notifikasi slot foto yang sedang dipilih (null = tidak ada). Parent memakai
  // ini untuk menampilkan toolbar adjust di luar area preview.
  onActiveSlotChange?: (slotId: string | null) => void;
}

export default function PreviewArea({
  selectedFrame,
  selectedFilter,
  onPhotoDropped,
  onCanvasReady,
  onActiveSlotChange,
}: PreviewAreaProps) {
  // Render di ruang koordinat asli frame (sama dengan slot disimpan di admin).
  // Server-side GIF & print sudah canvas-aware, jadi cukup samakan di sini.
  const CANVAS_W = selectedFrame?.canvasWidth || DEFAULT_CANVAS_W;
  const CANVAS_H = selectedFrame?.canvasHeight || DEFAULT_CANVAS_H;

  const { canvasRef, fabricCanvas, getFabricCanvas } = useCanvasRenderer({
    width: CANVAS_W,
    height: CANVAS_H,
  });

  const [dragOverSlotId, setDragOverSlotId] = useState<string | null>(null);
  const loadedSlotsRef = useRef<Set<string>>(new Set());
  const loadedFrameIdRef = useRef<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  // Slot foto yang sedang dipilih user → memunculkan toolbar adjust + highlight.
  const [activeSlotId, setActiveSlotId] = useState<string | null>(null);
  // Reset pilihan saat frame berganti (canvas dibersihkan, semua foto hilang).
  // Pakai pola "set state saat render dari nilai render sebelumnya" — bukan di
  // dalam effect — supaya tidak memicu cascading render (react-hooks rule).
  const prevFrameIdRef = useRef<string | null>(selectedFrame?.id ?? null);
  if ((selectedFrame?.id ?? null) !== prevFrameIdRef.current) {
    prevFrameIdRef.current = selectedFrame?.id ?? null;
    if (activeSlotId !== null) setActiveSlotId(null);
  }

  // Notify parent when canvas is ready
  useEffect(() => {
    if (fabricCanvas && onCanvasReady) {
      onCanvasReady(fabricCanvas);
    }
  }, [fabricCanvas, onCanvasReady]);

  // Compute scale to fit canvas into container
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !selectedFrame) return;

    const updateScale = () => {
      const { clientWidth, clientHeight } = container;
      const s = Math.min(clientWidth / CANVAS_W, clientHeight / CANVAS_H);
      setScale(s);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(container);
    return () => observer.disconnect();
  }, [selectedFrame, CANVAS_W, CANVAS_H]);

  // Load frame when selection changes.
  // Pakai instance canvas hidup dari ref (getFabricCanvas), BUKAN nilai closure
  // `fabricCanvas`. Saat dimensi frame berubah, canvas lama di-dispose & dibuat
  // ulang dalam commit yang sama; closure `fabricCanvas` masih menunjuk canvas
  // mati sehingga `.clear()` di atasnya melempar "clearRect of null". `fabricCanvas`
  // tetap di dependency hanya sebagai pemicu re-run setelah canvas dibuat ulang.
  useEffect(() => {
    const canvas = getFabricCanvas();
    if (!canvas) return;

    if (!selectedFrame) {
      canvas.clear();
      loadedSlotsRef.current.clear();
      loadedFrameIdRef.current = null;
      return;
    }

    const frameId = selectedFrame.id;
    if (loadedFrameIdRef.current === frameId) return;

    canvas.clear();
    loadedSlotsRef.current.clear();
    loadedFrameIdRef.current = frameId;

    loadFrameImage(canvas, selectedFrame.imageUrl)
      .then(() => {
        organizeCanvasLayers(canvas);
      })
      .catch((err) => {
        console.error('Failed to load frame:', err);
        loadedFrameIdRef.current = null;
      });
    // Sengaja re-run hanya saat id frame berubah (bukan tiap perubahan objek
    // selectedFrame); imageUrl terikat pada id & dijaga loadedFrameIdRef.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrame?.id, fabricCanvas, getFabricCanvas]);

  // Apply filter when selectedFilter changes
  useEffect(() => {
    const canvas = getFabricCanvas();
    if (!canvas) return;

    applyFilterToComposition(canvas, selectedFilter);
  }, [selectedFilter, fabricCanvas, getFabricCanvas]);

  // Selection + drag-clamp wiring. Pakai instance `fabricCanvas` (state) supaya
  // listener selalu nempel ke canvas terbaru (canvas dibuat ulang saat dimensi
  // frame berubah). Saat foto dipilih → tampilkan toolbar; saat di-drag → clamp
  // agar foto tetap menutupi slot (tidak ada celah putih).
  useEffect(() => {
    const canvas = fabricCanvas;
    if (!canvas) return;

    const syncActive = () => {
      const obj = canvas.getActiveObject();
      setActiveSlotId(obj?.data?.isPhoto ? (obj.data.slotId as string) : null);
    };
    const handleMoving = (e: fabric.IEvent) => {
      const obj = e.target;
      if (obj?.data?.isPhoto) clampPhotoToSlot(obj);
    };

    canvas.on('selection:created', syncActive);
    canvas.on('selection:updated', syncActive);
    canvas.on('selection:cleared', syncActive);
    canvas.on('object:moving', handleMoving);

    return () => {
      canvas.off('selection:created', syncActive);
      canvas.off('selection:updated', syncActive);
      canvas.off('selection:cleared', syncActive);
      canvas.off('object:moving', handleMoving);
    };
  }, [fabricCanvas]);

  // Beri tahu parent slot aktif berubah → parent render toolbar adjust di luar
  // area preview (sejajar tombol Confirm, agar tidak menutupi foto).
  useEffect(() => {
    onActiveSlotChange?.(activeSlotId);
  }, [activeSlotId, onActiveSlotChange]);

  // Determine which slot contains the drop coordinates
  const getSlotAtPosition = useCallback(
    (clientX: number, clientY: number): FrameSlot | null => {
      if (!selectedFrame?.slots) return null;

      const canvasEl = canvasRef.current;
      if (!canvasEl) return null;

      const wrapper = canvasEl.parentElement;
      if (!wrapper) return null;

      const rect = wrapper.getBoundingClientRect();
      const canvasX = ((clientX - rect.left) / rect.width) * CANVAS_W;
      const canvasY = ((clientY - rect.top) / rect.height) * CANVAS_H;

      return (
        selectedFrame.slots.find(
          (slot) =>
            canvasX >= slot.x &&
            canvasX <= slot.x + slot.width &&
            canvasY >= slot.y &&
            canvasY <= slot.y + slot.height,
        ) ?? null
      );
    },
    [selectedFrame, canvasRef, CANVAS_W, CANVAS_H],
  );

  // --- Drag & Drop handlers ---
  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const slot = getSlotAtPosition(e.clientX, e.clientY);
      setDragOverSlotId(slot?.id ?? null);
    },
    [getSlotAtPosition],
  );

  const handleDragLeave = useCallback(() => {
    setDragOverSlotId(null);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOverSlotId(null);

      const canvas = getFabricCanvas();
      if (!canvas || !selectedFrame?.slots) return;

      const rawData = e.dataTransfer.getData('application/json');
      if (!rawData) return;

      let photoData: { photoId: string; photoUrl: string };
      try {
        photoData = JSON.parse(rawData);
      } catch {
        console.error('Invalid drag data');
        return;
      }

      const slot = getSlotAtPosition(e.clientX, e.clientY);
      if (!slot) return;

      // Replace existing photo if any
      if (loadedSlotsRef.current.has(slot.id)) {
        removePhotoBySlotId(canvas, slot.id);
        loadedSlotsRef.current.delete(slot.id);
      }

      fitPhotoToSlot(photoData.photoUrl, slot, canvas)
        .then((img) => {
          loadedSlotsRef.current.add(slot.id);
          organizeCanvasLayers(canvas);
          // Langsung pilih foto yang baru di-drop → toolbar adjust muncul.
          canvas.setActiveObject(img);
          setActiveSlotId(slot.id);
          canvas.requestRenderAll();
          onPhotoDropped?.(slot.id, photoData.photoId, photoData.photoUrl);
        })
        .catch((err) => {
          console.error('Failed to load photo:', err);
        });
    },
    [getFabricCanvas, selectedFrame, getSlotAtPosition, onPhotoDropped],
  );

  // Border tipis pada slot yang sedang diedit (saat tidak sedang drag foto baru).
  const renderActiveSlotHighlight = () => {
    if (!selectedFrame?.slots || !activeSlotId || dragOverSlotId) return null;

    const slot = selectedFrame.slots.find((s) => s.id === activeSlotId);
    if (!slot) return null;

    return (
      <div
        className="absolute pointer-events-none border-2 border-[#3F72AF] rounded-md"
        style={{
          left: slot.x * scale,
          top: slot.y * scale,
          width: slot.width * scale,
          height: slot.height * scale,
        }}
      />
    );
  };

  // Render slot highlight overlay during drag
  const renderSlotHighlights = () => {
    if (!selectedFrame?.slots || !dragOverSlotId) return null;

    return selectedFrame.slots
      .filter((slot) => slot.id === dragOverSlotId)
      .map((slot) => (
        <div
          key={slot.id}
          className="absolute pointer-events-none border-2 border-[#3F72AF] bg-[#3F72AF]/20 rounded-md transition-opacity duration-150"
          style={{
            left: slot.x * scale,
            top: slot.y * scale,
            width: slot.width * scale,
            height: slot.height * scale,
            opacity: 1,
          }}
        />
      ));
  };

  return (
    <div className="relative h-full w-full flex flex-col p-2">
      <p className="gradient-text text-center text-[16px] leading-5 tracking[1.33px] mb-3">
        Preview
      </p>

      <div
        ref={containerRef}
        className="flex-1 flex items-center justify-center min-h-0"
      >
        {!selectedFrame && (
          <div
            className="border-4 border-dashed border-[#3F72AF]/30 rounded-2xl bg-transparent flex items-center justify-center"
            style={{
              aspectRatio: '464/696',
              width: '380px',
              maxHeight: '100%',
            }}
          >
            <p className="gradient-text text-center text-[16px] leading-5">
              Add Frame First
            </p>
          </div>
        )}

        <div
          className="relative"
          style={{
            width: CANVAS_W * scale,
            height: CANVAS_H * scale,
            display: selectedFrame ? 'block' : 'none',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div
            style={{
              width: CANVAS_W,
              height: CANVAS_H,
              transform: `scale(${scale})`,
              transformOrigin: 'top left',
            }}
          >
            <canvas ref={canvasRef} />
          </div>
          {renderActiveSlotHighlight()}
          {renderSlotHighlights()}
        </div>
      </div>
    </div>
  );
}
