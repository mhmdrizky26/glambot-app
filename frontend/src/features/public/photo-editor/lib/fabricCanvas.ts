import { fabric } from 'fabric';
import type { FrameSlot } from '../api/getFrames';

// Load frame image as overlay (above photos)
export const loadFrameImage = async (
  canvas: fabric.Canvas,
  frameUrl: string,
): Promise<fabric.Image> => {
  return new Promise((resolve, reject) => {
    fabric.Image.fromURL(
      frameUrl,
      (img) => {
        if (!img) {
          reject(new Error('Failed to load frame image'));
          return;
        }

        img.set({
          left: 0,
          top: 0,
          selectable: false,
          evented: false,
          data: { isFrame: true },
        });

        // Scale to fit canvas
        const canvasWidth = canvas.getWidth();
        const canvasHeight = canvas.getHeight();
        if (img.width && img.height) {
          img.scaleToWidth(canvasWidth);
          if (img.getScaledHeight() < canvasHeight) {
            img.scaleToHeight(canvasHeight);
          }
        }

        canvas.add(img);
        canvas.renderAll();
        resolve(img);
      },
      { crossOrigin: 'anonymous' },
    );
  });
};

// Remove frame from canvas
export const removeFrameFromCanvas = (canvas: fabric.Canvas): void => {
  const frameObjects = canvas.getObjects().filter((obj) => obj.data?.isFrame);
  frameObjects.forEach((obj) => canvas.remove(obj));
  canvas.renderAll();
};

// Create invisible drop zone for slot
export const createSlotDropZone = (
  slot: FrameSlot,
  canvas: fabric.Canvas,
): fabric.Rect => {
  const rect = new fabric.Rect({
    left: slot.x,
    top: slot.y,
    width: slot.width,
    height: slot.height,
    fill: 'transparent',
    stroke: 'transparent',
    strokeWidth: 2,
    selectable: false,
    evented: false,
    data: { isDropZone: true, slotId: slot.id },
  });

  canvas.add(rect);
  return rect;
};

// Create drop zones for all slots
export const createAllSlotDropZones = (
  slots: FrameSlot[],
  canvas: fabric.Canvas,
): fabric.Rect[] => {
  return slots.map((slot) => createSlotDropZone(slot, canvas));
};

// Remove all photos from canvas
export const removeAllPhotosFromCanvas = (canvas: fabric.Canvas): void => {
  const photoObjects = canvas.getObjects().filter((obj) => obj.data?.isPhoto);
  photoObjects.forEach((obj) => canvas.remove(obj));
  canvas.renderAll();
};

// Remove photo by slot ID
export const removePhotoBySlotId = (
  canvas: fabric.Canvas,
  slotId: string,
): void => {
  const photo = canvas
    .getObjects()
    .find((obj) => obj.data?.isPhoto && obj.data?.slotId === slotId);
  if (photo) {
    canvas.remove(photo);
    canvas.renderAll();
  }
};

// Organize layers: photos → frame → drop zones
export const organizeCanvasLayers = (canvas: fabric.Canvas): void => {
  const objects = canvas.getObjects();
  const frameObjects = objects.filter((obj) => obj.data?.isFrame);
  const photoObjects = objects.filter((obj) => obj.data?.isPhoto);
  const dropZones = objects.filter((obj) => obj.data?.isDropZone);

  photoObjects.forEach((obj) => canvas.sendToBack(obj));
  frameObjects.forEach((obj) => canvas.bringToFront(obj));
  dropZones.forEach((obj) => canvas.bringToFront(obj));

  canvas.renderAll();
};
