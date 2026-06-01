'use client';

import * as React from 'react';

type ChartContainerProps = {
  className?: string;
  children: (size: { width: number; height: number }) => React.ReactNode;
};

/**
 * Measures its own DOM size via ResizeObserver and only renders children
 * once we have positive width/height. This avoids the recharts warning
 * "The width(-1) and height(-1) of chart should be greater than 0" that
 * fires when ResponsiveContainer renders before the parent is measured.
 *
 * Children receive concrete numeric dimensions and should pass them to the
 * recharts component as `width` and `height` (do not use ResponsiveContainer
 * inside children).
 */
export function ChartContainer({ className, children }: ChartContainerProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(
    null,
  );

  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) {
        setSize((prev) =>
          prev && prev.width === width && prev.height === height
            ? prev
            : { width, height },
        );
      }
    });

    ro.observe(node);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={ref} className={className ?? 'h-full w-full'}>
      {size ? children(size) : null}
    </div>
  );
}
