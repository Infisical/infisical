import { useEffect, useLayoutEffect, useRef, useState } from "react";

import styles from "../auth.module.css";

const LENS = 232;
const CORNER = 9;
const GRID = 16;
const RULER_PERIOD = 128;
const EDGE = 24;

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

const readDurationMs = (element: Element, token: string) => {
  const raw = getComputedStyle(element).getPropertyValue(token).trim();
  const value = parseFloat(raw);
  if (!Number.isFinite(value)) return 0;
  return raw.endsWith("ms") ? value : value * 1000;
};

type Box = { left: number; top: number; right: number; bottom: number };
type Bounds = { width: number; height: number; copy: Box | null };

const rulerTicks = (length: number, edge: "bottom" | "right", size: number) => {
  const segments: string[] = [];
  for (let offset = -RULER_PERIOD; offset <= length + RULER_PERIOD; offset += GRID) {
    const index = Math.round(offset / GRID);
    let tick = 4;
    if (index % 8 === 0) tick = 10;
    else if (index % 4 === 0) tick = 7;
    const at = offset + 0.5;
    segments.push(
      edge === "bottom" ? `M${at} ${size}V${size - tick}` : `M${size} ${at}H${size - tick}`
    );
  }
  return segments.join("");
};

const lensGrid = () => {
  const segments: string[] = [];
  for (let at = GRID; at < LENS; at += GRID) {
    segments.push(`M${at + 0.5} 0V${LENS}`, `M0 ${at + 0.5}H${LENS}`);
  }
  return segments.join("");
};

const overlaps = (x: number, y: number, copy: Box | null) =>
  Boolean(
    copy &&
    x < copy.right + EDGE &&
    x + LENS > copy.left - EDGE &&
    y < copy.bottom + EDGE &&
    y + LENS > copy.top - EDGE
  );

const clampLens = (x: number, y: number, { width, height, copy }: Bounds) => {
  const cx = Math.min(Math.max(x, EDGE), width - LENS - EDGE);
  let cy = Math.min(Math.max(y, EDGE), height - LENS - EDGE);
  if (copy && overlaps(cx, cy, copy)) {
    const above = copy.top - EDGE - LENS;
    const below = copy.bottom + EDGE;
    cy = Math.abs(cy - above) < Math.abs(cy - below) && above >= EDGE ? above : below;
  }
  return { x: cx, y: Math.min(cy, height - LENS - EDGE) };
};

// Lower-right quadrant, kept clear of the headline copy.
const driftArea = ({ width, height, copy }: Bounds) => {
  const minX = Math.max(width / 2, EDGE);
  const maxX = Math.max(minX, width - LENS - EDGE);
  const minY = Math.max(height / 2, copy ? copy.bottom + EDGE : 0, EDGE);
  const maxY = Math.max(minY, height - LENS - EDGE);
  return { minX, maxX, minY, maxY };
};

const driftTarget = (seconds: number, bounds: Bounds) => {
  const { minX, maxX, minY, maxY } = driftArea(bounds);
  const sx = 0.5 + 0.5 * Math.sin(seconds * 0.24);
  const sy = 0.5 + 0.5 * Math.sin(seconds * 0.38 + 1.3);
  return { x: lerp(minX, maxX, sx), y: lerp(minY, maxY, sy) };
};

const restTarget = (bounds: Bounds) => {
  const { minX, maxX, minY, maxY } = driftArea(bounds);
  return { x: lerp(minX, maxX, 0.5), y: lerp(minY, maxY, 0.5) };
};

type Props = { copyRef: React.RefObject<HTMLElement | null> };

export const AuthLens = ({ copyRef }: Props) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const lensRef = useRef<SVGGElement>(null);
  const rowRef = useRef<SVGPathElement>(null);
  const columnRef = useRef<SVGPathElement>(null);
  const bottomRulerRef = useRef<SVGPathElement>(null);
  const rightRulerRef = useRef<SVGPathElement>(null);
  const boundsRef = useRef<Bounds>({ width: 0, height: 0, copy: null });
  const pointerRef = useRef<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return undefined;
    const measure = () => {
      const panel = svg.getBoundingClientRect();
      const copy = copyRef.current?.getBoundingClientRect();
      boundsRef.current = {
        width: panel.width,
        height: panel.height,
        copy: copy
          ? {
              left: copy.left - panel.left,
              top: copy.top - panel.top,
              right: copy.right - panel.left,
              bottom: copy.bottom - panel.top
            }
          : null
      };
      setSize({ width: panel.width, height: panel.height });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(svg);
    if (copyRef.current) observer.observe(copyRef.current);
    return () => observer.disconnect();
  }, [copyRef]);

  useEffect(() => {
    const svg = svgRef.current;
    const panel = svg?.parentElement;
    if (!svg || !panel || size.width === 0) return undefined;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const follow = readDurationMs(svg, "--v4-duration-slow") || 1;
    let position = restTarget(boundsRef.current);
    let seconds = 0;
    let last = 0;
    let frame = 0;

    const paint = () => {
      const { x, y } = position;
      const cx = Math.round(x + LENS / 2);
      const cy = Math.round(y + LENS / 2);
      if (lensRef.current) lensRef.current.style.transform = `translate(${x}px, ${y}px)`;
      if (rowRef.current) rowRef.current.style.transform = `translateY(${cy}px)`;
      if (columnRef.current) columnRef.current.style.transform = `translateX(${cx}px)`;
      if (bottomRulerRef.current) {
        bottomRulerRef.current.style.transform = `translateX(${cx % RULER_PERIOD}px)`;
      }
      if (rightRulerRef.current) {
        rightRulerRef.current.style.transform = `translateY(${cy % RULER_PERIOD}px)`;
      }
    };

    const tick = (now: number) => {
      const dt = last ? Math.min(now - last, 64) : 16;
      last = now;
      seconds += dt / 1000;
      const bounds = boundsRef.current;
      const pointer = pointerRef.current;
      const target = pointer
        ? clampLens(pointer.x - LENS / 2, pointer.y - LENS / 2, bounds)
        : driftTarget(seconds, bounds);
      const amount = 1 - Math.exp(-dt / follow);
      position = { x: lerp(position.x, target.x, amount), y: lerp(position.y, target.y, amount) };
      paint();
      frame = requestAnimationFrame(tick);
    };

    const start = () => {
      cancelAnimationFrame(frame);
      if (reducedMotion.matches) {
        position = restTarget(boundsRef.current);
        paint();
        return;
      }
      last = 0;
      frame = requestAnimationFrame(tick);
    };

    const onVisibility = () => {
      if (document.hidden) cancelAnimationFrame(frame);
      else start();
    };
    const onPointerMove = (event: PointerEvent) => {
      if (reducedMotion.matches) return;
      const rect = svg.getBoundingClientRect();
      pointerRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };
    const onPointerLeave = () => {
      pointerRef.current = null;
    };

    start();
    panel.addEventListener("pointermove", onPointerMove);
    panel.addEventListener("pointerleave", onPointerLeave);
    document.addEventListener("visibilitychange", onVisibility);
    reducedMotion.addEventListener("change", start);
    return () => {
      cancelAnimationFrame(frame);
      panel.removeEventListener("pointermove", onPointerMove);
      panel.removeEventListener("pointerleave", onPointerLeave);
      document.removeEventListener("visibilitychange", onVisibility);
      reducedMotion.removeEventListener("change", start);
    };
  }, [size.width, size.height]);

  const { width, height } = size;
  const corners = [
    [-4.5, -4.5],
    [LENS - 4.5, -4.5],
    [-4.5, LENS - 4.5],
    [LENS - 4.5, LENS - 4.5]
  ];

  return (
    <svg
      ref={svgRef}
      className={styles.lens}
      width="100%"
      height="100%"
      fill="none"
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {width > 0 && (
        <>
          <path ref={rowRef} d={`M0 0.5H${width}`} className={styles.lensRule} />
          <path ref={columnRef} d={`M0.5 0V${height}`} className={styles.lensRule} />
          <g ref={lensRef}>
            <path d={lensGrid()} className={styles.lensGrid} strokeDasharray="2 2" />
            <rect x="0.5" y="0.5" width={LENS - 1} height={LENS - 1} className={styles.lensFrame} />
            {corners.map(([x, y]) => (
              <rect
                key={`${x}-${y}`}
                x={x}
                y={y}
                width={CORNER}
                height={CORNER}
                className={styles.lensCorner}
              />
            ))}
            <rect
              x={LENS / 2 - 3.5}
              y={LENS / 2 - 3.5}
              width="7"
              height="7"
              className={styles.lensCenter}
            />
          </g>
          <path
            ref={bottomRulerRef}
            d={rulerTicks(width, "bottom", height)}
            className={styles.lensRuler}
          />
          <path
            ref={rightRulerRef}
            d={rulerTicks(height, "right", width)}
            className={styles.lensRuler}
          />
        </>
      )}
    </svg>
  );
};
