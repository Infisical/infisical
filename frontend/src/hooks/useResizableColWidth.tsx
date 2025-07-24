import { MouseEvent, useCallback, useEffect, useRef, useState } from "react";

type Params = {
  minWidth: number;
  maxWidth: number;
  initialWidth: number;
};

export const useResizableColWidth = ({ minWidth, maxWidth, initialWidth }: Params) => {
  const [colWidth, setColWidth] = useState(initialWidth);
  const [isResizing, setIsResizing] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = useCallback(
    (e: MouseEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      startX.current = e.clientX;
      startWidth.current = colWidth;
    },
    [colWidth]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!isResizing) return;

      const deltaX = e.clientX - startX.current;
      const newWidth = Math.max(minWidth, Math.min(maxWidth, startWidth.current + deltaX));

      setColWidth(newWidth);
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
      document.body.style.cursor = "ew-resize";
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
    colWidth,
    handleMouseDown,
    isResizing
  };
};
