import { MouseEvent, useCallback, useEffect, useRef, useState } from "react";

type Params = {
  minHeight: number;
  maxHeight: number;
  initialHeight: number;
};

export const useResizableHeaderHeight = ({ minHeight, maxHeight, initialHeight }: Params) => {
  const [headerHeight, setHeaderHeight] = useState(initialHeight);
  const [isResizing, setIsResizing] = useState(false);
  const startY = useRef(0);
  const startHeight = useRef(0);

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startY.current = e.clientY;
      startHeight.current = headerHeight;
    },
    [headerHeight]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaY = e.clientY - startY.current;
      const newHeight = Math.max(minHeight, Math.min(maxHeight, startHeight.current + deltaY));

      setHeaderHeight(newHeight);
    },
    [isResizing]
  );

  const handleMouseUp = useCallback(() => {
    setIsResizing(false);
  }, []);

  useEffect(() => {
    if (isResizing) {
      document.addEventListener(
        "mousemove",
        // @ts-expect-error native discrepancy
        handleMouseMove
      );
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "ns-resize";
      document.body.style.userSelect = "none";
    }

    return () => {
      document.removeEventListener(
        "mousemove",
        // @ts-expect-error native discrepancy
        handleMouseMove
      );
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, handleMouseMove, handleMouseUp]);

  return {
    headerHeight,
    handleMouseDown,
    isResizing
  };
};
