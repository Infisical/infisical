import { Children, ReactNode, useLayoutEffect, useRef, useState } from "react";

const ProductTile = ({ children }: { children: ReactNode }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState(1);

  useLayoutEffect(() => {
    const tile = ref.current;
    if (!tile) return undefined;

    const measure = () => setRows(Math.max(1, Math.ceil(tile.getBoundingClientRect().height)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(tile);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className="min-w-0 self-start pb-4" style={{ gridRowEnd: `span ${rows}` }}>
      {children}
    </div>
  );
};

export const ProductCardGrid = ({ children }: { children: ReactNode }) => (
  <div className="grid auto-rows-[1px] grid-cols-1 gap-x-4 xl:grid-cols-2">
    {Children.map(children, (child) => (child ? <ProductTile>{child}</ProductTile> : null))}
  </div>
);
