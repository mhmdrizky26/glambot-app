import { fabric } from 'fabric';
import { Image as FabricImage } from 'fabric/fabric-impl';

export type FilterType = 'original' | 'warm' | 'cool' | 'vintage' | 'dramatic';

/**
 * Get Fabric.js filter array for given filter type
 */
export const getFiltersByType = (filterType: FilterType): any[] => {
  switch (filterType) {
    case 'original':
      return []; // No filters

    case 'warm':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            1.1,
            0,
            0,
            0,
            0.05, // Boost red
            0,
            1.0,
            0,
            0,
            0.03, // Slight green
            0,
            0,
            0.9,
            0,
            0, // Reduce blue
            0,
            0,
            0,
            1,
            0,
          ],
        }),
      ];

    case 'cool':
      return [
        new fabric.Image.filters.ColorMatrix({
          matrix: [
            0.9,
            0,
            0,
            0,
            0, // Reduce red
            0,
            1.0,
            0,
            0,
            0.02, // Slight green
            0,
            0,
            1.1,
            0,
            0.05, // Boost blue
            0,
            0,
            0,
            1,
            0,
          ],
        }),
      ];

    case 'vintage':
      return [
        new fabric.Image.filters.Sepia(),
        new fabric.Image.filters.Brightness({ brightness: 0.05 }),
        new fabric.Image.filters.Contrast({ contrast: -0.1 }),
      ];

    case 'dramatic':
      return [
        new fabric.Image.filters.Contrast({ contrast: 0.3 }),
        new fabric.Image.filters.Saturation({ saturation: 0.4 }),
      ];

    default:
      return [];
  }
};

/**
 * Apply filter to a single Fabric.js image
 */
export const applyFilterToImage = (
  image: FabricImage,
  filterType: FilterType,
): void => {
  const filters = getFiltersByType(filterType);
  image.filters = filters;
  image.applyFilters();
};

/**
 * Apply filter to all photos in composition
 */
export const applyFilterToComposition = (
  canvas: fabric.Canvas,
  filterType: FilterType,
): void => {
  const objects = canvas.getObjects();

  objects.forEach((obj) => {
    if (obj.type === 'image' && (obj as any).data?.isPhoto) {
      applyFilterToImage(obj as FabricImage, filterType);
    }
  });

  canvas.renderAll();
};
