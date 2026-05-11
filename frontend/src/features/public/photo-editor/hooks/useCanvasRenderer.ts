'use client';

import { useEffect, useRef, useCallback } from 'react';
import { fabric } from 'fabric';

/**
 * Options for the useCanvasRenderer hook
 */
interface UseCanvasRendererOptions {
  width?: number;
  height?: number;
  onReady?: (canvas: fabric.Canvas) => void;
}

const DEFAULT_CANVAS_WIDTH = 464;
const DEFAULT_CANVAS_HEIGHT = 696;

export const useCanvasRenderer = ({
  width = DEFAULT_CANVAS_WIDTH,
  height = DEFAULT_CANVAS_HEIGHT,
  onReady,
}: UseCanvasRendererOptions = {}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricCanvasRef = useRef<fabric.Canvas | null>(null);

  // Stabilize onReady callback reference to avoid re-init on every render
  const onReadyRef = useRef(onReady);
  onReadyRef.current = onReady;

  useEffect(() => {
    const canvasEl = canvasRef.current;
    if (!canvasEl) return;

    // Prevent double initialization (React StrictMode)
    if (fabricCanvasRef.current) {
      console.log('[useCanvasRenderer] Canvas already initialized, skipping');
      const existingCanvas = fabricCanvasRef.current;

      return () => {
        console.log('[useCanvasRenderer] Cleaning up existing canvas');
        existingCanvas.dispose();
        fabricCanvasRef.current = null;
      };
    }

    console.log('[useCanvasRenderer] Initializing new Fabric.js canvas:', {
      width,
      height,
    });

    // Initialize Fabric.js canvas
    const fabricCanvas = new fabric.Canvas(canvasEl, {
      width,
      height,
      selection: false, // Disable multi-select (not needed for photo editor)
      renderOnAddRemove: true, // Auto re-render when objects are added/removed
      preserveObjectStacking: true, // Maintain z-index order on selection
    });

    fabricCanvasRef.current = fabricCanvas;

    // Notify consumer that canvas is ready
    onReadyRef.current?.(fabricCanvas);

    console.log('[useCanvasRenderer] Canvas initialized successfully');

    // Cleanup on unmount
    return () => {
      console.log('[useCanvasRenderer] Disposing canvas on unmount');
      fabricCanvas.dispose();
      fabricCanvasRef.current = null;
    };
  }, [width, height]);

  const clearCanvas = useCallback(() => {
    const canvas = fabricCanvasRef.current;
    if (!canvas) return;

    canvas.clear();
    canvas.renderAll();
  }, []);

  return {
    /** Ref to attach to the <canvas> element */
    canvasRef,
    /** The Fabric.js canvas instance (null until initialized) */
    fabricCanvas: fabricCanvasRef.current,
    /** Get the current fabric canvas instance (always up-to-date via ref) */
    getFabricCanvas: () => fabricCanvasRef.current,
    /** Clear all objects from the canvas */
    clearCanvas,
  };
};
