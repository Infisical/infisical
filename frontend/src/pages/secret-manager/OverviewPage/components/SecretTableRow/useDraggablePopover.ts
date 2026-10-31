import { HTMLAttributes, useLayoutEffect, useRef, useState } from "react";

type PopoverSide = "top" | "right" | "bottom" | "left";

export const useDraggablePopover = (isOpen: boolean) => {
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [side, setSide] = useState<PopoverSide>();
  const dragStart = useRef<{ pointerX: number; pointerY: number; x: number; y: number }>(undefined);

  useLayoutEffect(() => {
    dragStart.current = undefined;
    if (!isOpen) return;
    setOffset({ x: 0, y: 0 });
    setSide(undefined);
  }, [isOpen]);

  // Radix re-flips a popover that nears a viewport edge; pinning the side it opened on keeps a dragged popover from jumping.
  const lockSide = (handle: HTMLElement) => {
    if (side) return;
    const openedSide = handle.closest("[data-side]")?.getAttribute("data-side");
    setSide(
      openedSide === "top" || openedSide === "left" || openedSide === "right"
        ? openedSide
        : "bottom"
    );
  };

  const dragHandleProps: HTMLAttributes<HTMLDivElement> = {
    onPointerDown: (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      lockSide(e.currentTarget);
      dragStart.current = { pointerX: e.clientX, pointerY: e.clientY, ...offset };
    },
    onPointerMove: (e) => {
      const start = dragStart.current;
      if (!start) return;
      setOffset({
        x: start.x + e.clientX - start.pointerX,
        y: start.y + e.clientY - start.pointerY
      });
    },
    onPointerUp: () => {
      dragStart.current = undefined;
    },
    onLostPointerCapture: () => {
      dragStart.current = undefined;
    },
    onKeyDown: (e) => {
      const step = e.shiftKey ? 64 : 16;
      const deltas: Record<string, { x: number; y: number } | undefined> = {
        ArrowLeft: { x: -step, y: 0 },
        ArrowRight: { x: step, y: 0 },
        ArrowUp: { x: 0, y: -step },
        ArrowDown: { x: 0, y: step }
      };
      const delta = deltas[e.key];
      if (!delta) return;
      e.preventDefault();
      lockSide(e.currentTarget);
      setOffset((prev) => ({ x: prev.x + delta.x, y: prev.y + delta.y }));
    }
  };

  return {
    popoverContentProps: {
      side: side ?? ("bottom" as const),
      avoidCollisions: !side,
      style: { translate: `${offset.x}px ${offset.y}px` }
    },
    dragHandleProps
  };
};
