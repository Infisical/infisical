import * as React from "react";
import { Progress as ProgressPrimitive } from "radix-ui";

import { cn } from "../lib/utils";

import styles from "./controls.module.css";

export function Progress({
  className,
  value,
  max = 100,
  label,
  valueLabel,
  tone = "ink",
  warnAt = 0.8,
  ref,
  ...props
}: React.ComponentPropsWithoutRef<typeof ProgressPrimitive.Root> & {
  label?: string;
  valueLabel?: string;
  tone?: "ink" | "warn" | "bad" | "auto";
  warnAt?: number;
} & { ref?: React.Ref<React.ComponentRef<typeof ProgressPrimitive.Root>> }) {
  const resolvedMax = Number.isFinite(max) && max > 0 ? max : 100;
  const resolvedValue =
    typeof value === "number" && Number.isFinite(value) && value >= 0
      ? Math.min(value, resolvedMax)
      : null;
  const ratio = typeof value === "number" ? value / resolvedMax : 0;
  const color = tone === "auto" ? (ratio >= 1 ? "bad" : ratio >= warnAt ? "warn" : "ink") : tone;
  return (
    <div data-slot="progress-group" data-tone={color} className={styles.progressGroup}>
      {(label || valueLabel) && (
        <div className={styles.progressLabels}>
          {label && <span className={styles.progressLabel}>{label}</span>}
          {valueLabel && <span className={styles.progressValue}>{valueLabel}</span>}
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
          "relative flex w-full items-center overflow-hidden",
          styles.progress,
          className
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          data-slot="progress-indicator"
          data-tone={color}
          className={cn("size-full flex-1", styles.progressIndicator)}
          style={{
            transform: `translateX(-${100 - ((resolvedValue ?? 0) / resolvedMax) * 100}%)`
          }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}
Progress.displayName = "Progress";

export const ProgressSteps = ({
  steps,
  current,
  label,
  showHeading = true
}: {
  steps: readonly string[];
  current: number;
  label: string;
  /** false drops the label and Step n of N row when the host already shows both, as MultiStep's overlay footer does. */
  showHeading?: boolean;
}) => {
  const step = Math.min(current + 1, steps.length);
  return (
    <div
      data-slot="progress-steps"
      role="group"
      aria-label={label}
      className={styles.progressGroup}
    >
      {showHeading && (
        <div className={styles.progressLabels}>
          <span className={styles.progressLabel}>{label}</span>
          <span className={styles.progressValue}>
            Step {step} of {steps.length}
          </span>
        </div>
      )}
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={steps.length}
        aria-valuenow={Math.max(0, Math.min(current, steps.length))}
        aria-valuetext={`Step ${step} of ${steps.length}${steps[current] ? `, ${steps[current]}` : ""}`}
        className={styles.stepBars}
      >
        {steps.map((name, index) => (
          <span
            key={`${index}-${name}`}
            className={styles.stepBar}
            data-current={index === current || undefined}
            data-complete={index < current || undefined}
          />
        ))}
      </div>
      <ol aria-hidden="true" className={styles.stepLabels}>
        {steps.map((name, index) => (
          <li key={`${index}-${name}`} data-current={index === current || undefined}>
            {name}
          </li>
        ))}
      </ol>
    </div>
  );
};
