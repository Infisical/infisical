import { useEffect, useState } from "react";

export const useFillHeight = <T extends HTMLElement>() => {
  const [node, setNode] = useState<T | null>(null);
  const [height, setHeight] = useState<number>();
  useEffect(() => {
    if (!node) return undefined;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setHeight(Math.floor(entry.contentRect.height));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [node]);
  return [setNode, height] as const;
};
