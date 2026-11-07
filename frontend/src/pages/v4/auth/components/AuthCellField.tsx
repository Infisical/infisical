import { CSSProperties, RefObject, useEffect, useLayoutEffect, useRef, useState } from "react";

import styles from "../auth.module.css";

// Ported from infisical-web components/externalWebsite/redesign/sections/careers/PixelShimmer.js
// as the homepage hero mounts it (HomepageHero.js). Times are multiples of --v4-duration-slow.
const CELL = 44;
const SCATTER_DENSITY = 0.54;
const IMAGE_RATIO = 0.05;
const DARK_RATIO = 0.04;
const VOLT_SOLID_RATIO = 0.025;
const HEAVY_BLINK_RATIO = 0.07;
const GHOST_BLINK_RATIO = 0.02;
const GRID_PERIOD = 6;
const GRID_FILL = 0.72;
const SHIMMER_MIN = 18.75;
const SHIMMER_MAX = 39.5;
const BLINK_MIN = 14.5;
const BLINK_SPAN = 16.5;
const PEAK_MIN = 0.32;
const PEAK_MAX = 0.72;
const MOVER_RATIO = 0.16;
const WALK_MIN = 37.5;
const WALK_MAX = 75;
const WALKS = ["a", "b", "c", "d"] as const;
const REPEL_RADIUS = 120;
const ENTER_STAGGER = 3.75;
const MOVE_STAGGER = 0.58;
const STEP_MS = 55;
const COPY_MARGIN = 1;

type Kind = "grid" | "ghost" | "dark" | "accent";
type Copy = { c0: number; c1: number; r0: number; r1: number } | null;
type Dims = { cols: number; rows: number; copy: Copy };

const rand = (r: number, c: number, salt = 0) => {
  const x = Math.sin(r * 374761393 + c * 668265263 + salt * 982451653 + 9301) * 43758.5453;
  return x - Math.floor(x);
};

const smoothstep = (v: number) => {
  const x = Math.min(Math.max(v, 0), 1);
  return x * x * (3 - 2 * x);
};

// The hero's slope: rises from the left third to fill the top right, then dissolves below it.
const fieldMask = (nx: number, ny: number) => {
  const ridge =
    1 -
    1.15 * smoothstep((nx - 0.18) / 0.42) +
    0.05 * Math.sin(nx * 17 + 0.8) +
    0.03 * Math.sin(nx * 41);
  const slope = smoothstep((ny - ridge) / 0.16);
  const base = 1 - smoothstep((ny - 0.6) / 0.15);
  return Math.max(nx > 0.15 ? 0.06 : 0, slope * base);
};

type Cell = {
  r: number;
  c: number;
  kind: Kind;
  blink: boolean;
  dur: number;
  delay: number;
  peak: number;
  floor: number;
  walk?: (typeof WALKS)[number];
  walkDur: number;
  walkDelay: number;
  enterDelay: number;
  moveDelay: number;
};

const makeCell = (r: number, c: number, { cols, rows, copy }: Dims): Cell | null => {
  const isGrid = r % GRID_PERIOD === 0 || c % GRID_PERIOD === 0;
  if (rand(r, c) >= (isGrid ? GRID_FILL : SCATTER_DENSITY)) return null;
  if (copy && c >= copy.c0 && c <= copy.c1 && r >= copy.r0 && r <= copy.r1) return null;
  if (rand(r, c, 97) >= fieldMask((c + 0.5) / cols, (r + 0.5) / rows)) return null;

  const roll = rand(r, c, 3);
  const heavy = !isGrid && roll < IMAGE_RATIO + DARK_RATIO + VOLT_SOLID_RATIO;
  const image = heavy && roll < IMAGE_RATIO;
  const solid = heavy && roll >= IMAGE_RATIO + DARK_RATIO;
  const light = image && rand(r, c, 61) < 0.5;

  let blinkRatio = GHOST_BLINK_RATIO;
  if (isGrid) blinkRatio = 0;
  else if (heavy) blinkRatio = image || solid ? HEAVY_BLINK_RATIO : 0;
  const blink = rand(r, c, 73) < blinkRatio;

  let kind: Kind = "ghost";
  if (isGrid) kind = "grid";
  else if (heavy) kind = "dark";

  let dur = SHIMMER_MIN + rand(r, c, 11) * (SHIMMER_MAX - SHIMMER_MIN);
  if (isGrid) dur = SHIMMER_MAX + rand(r, c, 11) * SHIMMER_MAX;
  else if (blink) dur = BLINK_MIN + rand(r, c, 11) * BLINK_SPAN;

  let peak = PEAK_MIN + rand(r, c, 23) * (PEAK_MAX - PEAK_MIN);
  let floor = 0.16;
  if (isGrid) {
    peak = 0.42 + rand(r, c, 23) * 0.2;
    floor = 0.18;
  } else if (light) {
    peak = 0.28 + rand(r, c, 23) * 0.16;
    floor = 0.12;
  } else if (heavy) {
    peak = 0.72 + rand(r, c, 23) * 0.24;
    floor = 0.42;
  }

  const walkDur = WALK_MIN + rand(r, c, 43) * (WALK_MAX - WALK_MIN);
  return {
    r,
    c,
    kind,
    blink,
    dur,
    delay: -rand(r, c, 17) * dur,
    peak,
    floor,
    walk:
      rand(r, c, 37) < MOVER_RATIO ? WALKS[Math.floor(rand(r, c, 41) * WALKS.length)] : undefined,
    walkDur,
    walkDelay: -rand(r, c, 47) * walkDur,
    enterDelay: rand(r, c, 53) * ENTER_STAGGER,
    moveDelay: rand(r, c, 59) * MOVE_STAGGER
  };
};

// The hero scatters Volt squares; here one solid square takes the accent so there is only one.
const buildCells = (dims: Dims) => {
  const cells: Cell[] = [];
  for (let r = 0; r < dims.rows; r += 1) {
    for (let c = 0; c < dims.cols; c += 1) {
      const cell = makeCell(r, c, dims);
      if (cell) cells.push(cell);
    }
  }
  const accent = cells
    .filter((cell) => cell.kind === "dark")
    .reduce<Cell | null>(
      (best, cell) => (!best || rand(cell.r, cell.c, 71) < rand(best.r, best.c, 71) ? cell : best),
      null
    );
  return cells.map((cell) => (cell === accent ? { ...cell, kind: "accent" as const } : cell));
};

type Props = { copyRef: RefObject<HTMLElement | null> };

export const AuthCellField = ({ copyRef }: Props) => {
  const ref = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<Dims | null>(null);
  const [paused, setPaused] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const measure = () => {
      const panel = el.getBoundingClientRect();
      const box = copyRef.current?.getBoundingClientRect();
      const next: Dims = {
        cols: Math.ceil(panel.width / CELL) + 1,
        rows: Math.ceil(panel.height / CELL) + 1,
        copy: box
          ? {
              c0: Math.floor((box.left - panel.left) / CELL) - COPY_MARGIN,
              c1: Math.floor((box.right - panel.left) / CELL) + COPY_MARGIN,
              r0: Math.floor((box.top - panel.top) / CELL) - COPY_MARGIN,
              r1: Math.floor((box.bottom - panel.top) / CELL) + COPY_MARGIN
            }
          : null
      };
      setDims((current) =>
        current && JSON.stringify(current) === JSON.stringify(next) ? current : next
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (copyRef.current) observer.observe(copyRef.current);
    return () => observer.disconnect();
  }, [copyRef]);

  useEffect(() => {
    const onVisibility = () => setPaused(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Cells near the pointer are shoved a whole grid cell away, dominoing whatever sits in the
  // target slot, and flow home one cell at a time once the pointer moves on.
  useEffect(() => {
    const el = ref.current;
    if (!el || !dims || paused) return undefined;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return undefined;

    const slots = Array.from(el.querySelectorAll<HTMLElement>("[data-col]"));
    const home = slots.map((slot) => ({
      col: Number(slot.dataset.col),
      row: Number(slot.dataset.row)
    }));
    const gx = home.map(({ col }) => col);
    const gy = home.map(({ row }) => row);
    const occupied = new Map<string, number>(home.map(({ col, row }, i) => [`${col},${row}`, i]));

    const place = (i: number, sx: number, sy: number) => {
      occupied.delete(`${gx[i]},${gy[i]}`);
      gx[i] += sx;
      gy[i] += sy;
      occupied.set(`${gx[i]},${gy[i]}`, i);
      slots[i].style.transform =
        `translate(${(gx[i] - home[i].col) * CELL}px, ${(gy[i] - home[i].row) * CELL}px)`;
    };

    const tryMove = (i: number, sx: number, sy: number, depth: number): boolean => {
      if (depth > 64) return false;
      const occupant = occupied.get(`${gx[i] + sx},${gy[i] + sy}`);
      if (occupant !== undefined && occupant !== i && !tryMove(occupant, sx, sy, depth + 1)) {
        return false;
      }
      place(i, sx, sy);
      return true;
    };

    const mouse = { x: 0, y: 0, inside: false };
    let frame = 0;
    let last = 0;
    const inRadius = (x: number, y: number) =>
      Math.hypot(x * CELL + CELL / 2 - mouse.x, y * CELL + CELL / 2 - mouse.y) < REPEL_RADIUS;

    const loop = (now: number) => {
      const step = now - last >= STEP_MS;
      if (step) last = now;
      let busy = false;
      home.forEach(({ col, row }, i) => {
        if (mouse.inside && inRadius(gx[i], gy[i])) {
          busy = true;
          if (!step) return;
          const dx = gx[i] * CELL + CELL / 2 - mouse.x;
          const dy = gy[i] * CELL + CELL / 2 - mouse.y;
          let sx = Math.abs(dx) >= Math.abs(dy) * 0.4 ? Math.sign(dx) : 0;
          const sy = Math.abs(dy) >= Math.abs(dx) * 0.4 ? Math.sign(dy) : 0;
          if (sx === 0 && sy === 0) sx = 1;
          tryMove(i, sx, sy, 0);
        } else if (gx[i] !== col || gy[i] !== row) {
          busy = true;
          if (!step) return;
          const sx = Math.sign(col - gx[i]);
          const sy = Math.sign(row - gy[i]);
          const free = !occupied.has(`${gx[i] + sx},${gy[i] + sy}`);
          if (free && !(mouse.inside && inRadius(gx[i] + sx, gy[i] + sy))) place(i, sx, sy);
        }
      });
      frame = mouse.inside || busy ? requestAnimationFrame(loop) : 0;
    };

    const kick = () => {
      if (!frame) frame = requestAnimationFrame(loop);
    };
    const onMove = (event: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      mouse.x = event.clientX - rect.left;
      mouse.y = event.clientY - rect.top;
      mouse.inside =
        mouse.x >= 0 && mouse.y >= 0 && mouse.x <= rect.width && mouse.y <= rect.height;
      kick();
    };
    const onLeave = () => {
      mouse.inside = false;
      kick();
    };

    window.addEventListener("mousemove", onMove, { passive: true });
    document.addEventListener("mouseleave", onLeave);
    return () => {
      window.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [dims, paused]);

  const cells = dims ? buildCells(dims) : [];

  return (
    <div ref={ref} className={styles.field} data-paused={paused || undefined} aria-hidden="true">
      {cells.map((cell) => (
        <span
          key={`${cell.r}-${cell.c}`}
          className={styles.fieldSlot}
          data-col={cell.c}
          data-row={cell.r}
          style={
            {
              left: cell.c * CELL,
              top: cell.r * CELL,
              width: CELL,
              height: CELL,
              "--enter": cell.enterDelay,
              "--settle": cell.moveDelay
            } as CSSProperties
          }
        >
          <span
            className={styles.fieldCell}
            data-kind={cell.kind}
            data-blink={cell.blink || undefined}
            data-walk={cell.walk}
            style={
              {
                "--peak": cell.peak,
                "--floor": cell.floor,
                "--breathe": cell.dur,
                "--offset": cell.delay,
                "--walk": cell.walkDur,
                "--walk-offset": cell.walkDelay
              } as CSSProperties
            }
          />
        </span>
      ))}
    </div>
  );
};
