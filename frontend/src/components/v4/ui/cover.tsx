import * as React from "react";

import { cn } from "../lib/utils";

import styles from "./cover.module.css";

const dots = Array.from({ length: 32 }, (_, index) => ({
  x: 648 + (index % 8) * 16,
  y: 136 + Math.floor(index / 8) * 16
}));

export type CoverProps = Omit<React.ComponentPropsWithoutRef<"div">, "title"> & {
  title: React.ReactNode;
  tagline?: React.ReactNode;
};

export const Cover = React.forwardRef<HTMLDivElement, CoverProps>(
  ({ title, tagline, className, ...props }, ref) => (
    <div ref={ref} data-slot="cover" className={cn(styles.cover, className)} {...props}>
      <svg className={styles.art} viewBox="480 0 480 288" aria-hidden="true" focusable="false">
        <rect className={cn(styles.slab, styles.block)} x="624" y="-8" width="344" height="216" />
        <rect className={cn(styles.accent, styles.block)} x="512" y="168" width="96" height="96" />
        <rect className={cn(styles.band, styles.block)} x="624" y="224" width="344" height="40" />
        {dots.map((dot) => (
          <rect
            key={`${dot.x}-${dot.y}`}
            className={styles.dot}
            x={dot.x}
            y={dot.y}
            width="4"
            height="4"
          />
        ))}
      </svg>
      <div className={styles.words}>
        <h1 className={styles.title}>{title}</h1>
        {tagline && <p className={styles.tagline}>{tagline}</p>}
      </div>
    </div>
  )
);
Cover.displayName = "Cover";
