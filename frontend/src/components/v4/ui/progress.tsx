import * as React from "react";
import { cn } from "cn";
import { Progress as ProgressPrimitive } from "radix-ui";

import styles from "./controls.module.css";
import helperStyles from "./helpers.module.css";

export const Progress = React.forwardRef<
  React.ComponentRef<typeof ProgressPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
    label?: string;
    valueLabel?: string;
    tone?: "ink" | "warn" | "bad" | "auto";
    warnAt?: number;
  }
>(
  (
    { className, value, max = 100, label, valueLabel, tone = "ink", warnAt = 0.8, ...props },
    ref
  ) => {
    const resolvedMax = Number.isFinite(max) && max > 0 ? max : 100;
    const resolvedValue =
      typeof value === "number" && Number.isFinite(value) && value >= 0
        ? Math.min(value, resolvedMax)
        : null;
    const ratio = typeof value === "number" ? value / resolvedMax : 0;
    const color = tone === "auto" ? (ratio >= 1 ? "bad" : ratio >= warnAt ? "warn" : "ink") : tone;
    return (
      <div data-slot="progress-group" className={styles.progressGroup}>
        {(label || valueLabel) && (
          <div className={styles.progressLabels}>
            {label && <span>{label}</span>}
            {valueLabel && <span className={styles.mono}>{valueLabel}</span>}
          </div>
        )}
        <ProgressPrimitive.Root
          ref={ref}
          data-slot="progress"
          data-tone={tone}
          value={resolvedValue}
          max={resolvedMax}
          aria-label={label}
          aria-valuetext={
            valueLabel ??
            (typeof value === "number" && value > resolvedMax
              ? `${value} of ${resolvedMax}, over`
              : undefined)
          }
          className={cn(
            "relative flex h-1.5 w-full items-center overflow-hidden bg-[color:var(--v4-line-soft)]",
            styles.progress,
            className
          )}
          {...props}
        >
          <ProgressPrimitive.Indicator
            data-slot="progress-indicator"
            data-tone={color}
            className={cn("size-full flex-1 transition-all", styles.progressIndicator)}
            style={{
              transform: `translateX(-${100 - ((resolvedValue ?? 0) / resolvedMax) * 100}%)`
            }}
          />
        </ProgressPrimitive.Root>
      </div>
    );
  }
);
Progress.displayName = "Progress";

export const ProgressSteps = ({
  steps,
  current,
  label
}: {
  steps: readonly string[];
  current: number;
  label: string;
}) => (
  <div data-slot="progress-steps" role="group" aria-label={label}>
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={steps.length}
      aria-valuenow={Math.max(0, Math.min(current, steps.length))}
      aria-valuetext={`Step ${Math.min(current + 1, steps.length)} of ${steps.length}${steps[current] ? `, ${steps[current]}` : ""}`}
    />
    <ol aria-hidden="true" className={helperStyles.steps}>
      {steps.map((step, index) => (
        <li
          key={`${index}-${step}`}
          className={helperStyles.step}
          data-current={index === current || undefined}
          data-complete={index < current || undefined}
        >
          {step}
        </li>
      ))}
    </ol>
  </div>
);
