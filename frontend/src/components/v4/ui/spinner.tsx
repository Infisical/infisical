import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./runtime.module.css";

export type SpinnerSize = "inline" | "base" | "page";
const grids = {
  base: [
    "..####....####..",
    ".######..######.",
    "##....####....##",
    "##.....##.....##",
    "##.....##.....##",
    "##....####....##",
    ".######..######.",
    "..####....####.."
  ],
  page: [
    ".....######..........######.....",
    "...##########......##########...",
    "..############....############..",
    ".##############..##############.",
    ".####......##########......####.",
    "####........########........####",
    "####.........######.........####",
    "####..........####..........####",
    "####..........####..........####",
    "####.........######.........####",
    "####........########........####",
    ".####......##########......####.",
    ".##############..##############.",
    "..############....############..",
    "...##########......##########...",
    ".....######..........######....."
  ]
};

type SpinnerProps = Omit<React.ComponentPropsWithoutRef<"svg">, "children"> & {
  size?: SpinnerSize;
  label?: string;
  description?: string;
  delay?: number;
};

const useAfterDelay = (delay: number) => {
  const [shown, setShown] = React.useState(delay <= 0);
  React.useEffect(() => {
    if (delay <= 0) {
      setShown(true);
      return;
    }
    setShown(false);
    const timer = window.setTimeout(() => setShown(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);
  return shown;
};

export const Spinner = React.forwardRef<SVGSVGElement, SpinnerProps>(
  ({ size = "inline", label, description, delay = 0, className, ...props }, ref) => {
    const shown = useAfterDelay(delay);
    const grid = grids[size === "page" ? "page" : "base"];
    const pitch = size === "page" ? 5 : size === "base" ? 3 : 1;
    const dot = size === "page" ? 4 : size === "base" ? 2 : 1;
    const width = (grid[0].length - 1) * pitch + dot;
    const height = (grid.length - 1) * pitch + dot;
    if (!shown) return null;
    const mark =
      size === "inline" ? (
        <svg
          ref={ref}
          data-slot="spinner"
          data-size={size}
          width={16}
          height={8}
          viewBox="0 0 16 8"
          className={cn(styles.spinner, styles.inline, label === undefined && className)}
          aria-hidden
          focusable="false"
          {...(label === undefined ? props : {})}
        >
          <rect x={1} y={1} width={6} height={6} />
          <rect x={9} y={1} width={6} height={6} />
        </svg>
      ) : (
        <svg
          ref={ref}
          data-slot="spinner"
          data-size={size}
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className={cn(styles.spinner, styles[size], label === undefined && className)}
          aria-hidden
          focusable="false"
          {...(label === undefined ? props : {})}
        >
          {grid.flatMap((row, y) =>
            [...row].flatMap((pixel, x) =>
              pixel === "#"
                ? [
                    <rect
                      key={`${x}-${y}`}
                      x={x * pitch}
                      y={y * pitch}
                      width={dot}
                      height={dot}
                      data-cross={
                        Math.abs(x + y + 1 - (grid[0].length + grid.length) / 2) <=
                          (size === "page" ? 2 : 1) &&
                        Math.abs(x - y - (grid[0].length - grid.length) / 2) <=
                          (size === "page" ? 2 : 1)
                          ? ""
                          : undefined
                      }
                      style={{
                        animationDelay: (() => {
                          const columns = grid[0].length;
                          const centerY = grid.length / 2;
                          const right = x + 0.5 > columns / 2;
                          const angle =
                            (Math.atan2(
                              y + 0.5 - centerY,
                              x + 0.5 - columns * (right ? 0.7276 : 0.2724)
                            ) *
                              180) /
                            Math.PI;
                          const phase = right
                            ? ((((angle - 180) % 360) + 360) % 360) / 720
                            : 0.5 + (((-angle % 360) + 360) % 360) / 720;
                          const steps = size === "page" ? 40 : 24;
                          const snapped = Math.floor(phase * steps) / steps;
                          return size === "page"
                            ? `${Math.hypot(x - columns / 2, y - centerY) * 0.02}s, ${0.95 + snapped * 2.4}s`
                            : `${-(1 - snapped) * 1.6}s`;
                        })()
                      }}
                    />
                  ]
                : []
            )
          )}
        </svg>
      );
    if (label === undefined) return mark;
    return (
      <div
        data-slot="spinner-status"
        data-size={size}
        role="status"
        aria-live="polite"
        className={cn(
          styles.status,
          size === "inline" && styles.statusInline,
          size === "page" && styles.statusPage,
          className
        )}
        {...(props as React.ComponentPropsWithoutRef<"div">)}
      >
        {mark}
        <span className={styles.statusLabel}>{label}</span>
        {description && size === "page" && (
          <span className={styles.statusDescription}>{description}</span>
        )}
      </div>
    );
  }
);
Spinner.displayName = "Spinner";
