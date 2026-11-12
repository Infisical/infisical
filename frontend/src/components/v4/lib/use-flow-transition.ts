import { type CSSProperties, useCallback, useEffect, useLayoutEffect, useState } from "react";

export const useFlowTransition = (index: number) => {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches)
  );
  const [height, setHeight] = useState<number>();
  const [ready, setReady] = useState(false);
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [travel, setTravel] = useState<{ index: number; direction: "forward" | "back" }>({
    index,
    direction: "forward"
  });
  const [intended, setIntended] = useState<"forward" | "back">();
  if (travel.index !== index) {
    setTravel({ index, direction: intended ?? (index > travel.index ? "forward" : "back") });
    setIntended(undefined);
  }
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const change = () => setReduced(Boolean(query?.matches));
    query?.addEventListener("change", change);
    return () => query?.removeEventListener("change", change);
  }, []);
  const measure = useCallback((element: HTMLElement | null) => setNode(element), []);
  useLayoutEffect(() => {
    if (!node) return undefined;
    const update = () => {
      if (node.offsetHeight > 0) setHeight(node.offsetHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    const frame =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => setReady(true))
        : undefined;
    if (frame === undefined) setReady(true);
    return () => {
      observer.disconnect();
      if (frame !== undefined) cancelAnimationFrame(frame);
    };
  }, [node]);
  let style: CSSProperties = {};
  if (reduced) style = { transition: "none" };
  else if (height !== undefined) style = { height };
  return {
    measure,
    style,
    ready,
    reduced,
    direction: travel.direction,
    intend: setIntended
  };
};
