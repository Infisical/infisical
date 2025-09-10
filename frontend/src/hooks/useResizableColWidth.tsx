import { MouseEvent, RefObject, useCallback, useEffect, useRef, useState } from "react";

type Params = {
  minWidth: number;
  maxWidth: number;
  initialWidth: number;
  ref: RefObject<HTMLTableElement>;
};

export const useResizableColWidth = ({ minWidth, maxWidth, initialWidth, ref }: Params) => {
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

  useEffect(() => {
    const element = ref?.current;
    if (!element) return;

    const handleResize = () => {
      if (colWidth > maxWidth) {
        setColWidth(Math.max(maxWidth, minWidth));
      } else if (ref.current?.clientWidth && colWidth > ref.current.clientWidth * 0.9) {
        // this else is a fallback to ensure col is always visible
        setColWidth(initialWidth);
      }
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(element);

    // eslint-disable-next-line consistent-return
    return () => {
      resizeObserver.disconnect();
    };
  }, [ref, maxWidth, colWidth]);

  return {
    colWidth,
    handleMouseDown,
    isResizing
  };
};
