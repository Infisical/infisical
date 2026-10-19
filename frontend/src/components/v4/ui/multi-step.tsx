import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { exit, snap, spring } from "../lib/motion";
import { useControllableState } from "../lib/use-controllable-state";
import { cn } from "../lib/utils";
import { Button } from "./button";
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from "./dialog";
import { Icon } from "./icon";
import { ProgressSteps } from "./progress";
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from "./sheet";

import styles from "./multi-step.module.css";

type ValidateResult = boolean | string | void;

export interface MultiStepStep {
  title: string;
  heading?: string;
  description?: React.ReactNode;
  summary?: React.ReactNode;
  content: React.ReactNode;
  validate?: () => ValidateResult | Promise<ValidateResult>;
  nextLabel?: string;
}

export type StepsProps = {
  steps: readonly Pick<MultiStepStep, "title" | "summary">[];
  current: number;
  label?: string;
} & (
  | { orientation?: "horizontal"; onStepClick?: never }
  | { orientation: "vertical"; onStepClick?: (index: number) => void }
);

export const Steps = ({
  steps,
  current,
  orientation = "horizontal",
  onStepClick,
  label = "Steps"
}: StepsProps) => {
  if (orientation === "horizontal")
    return (
      <ProgressSteps steps={steps.map((entry) => entry.title)} current={current} label={label} />
    );
  return (
    <ol data-slot="steps" aria-label={label} className={styles.steps}>
      {steps.map((entry, index) => {
        const state = index < current ? "done" : index === current ? "current" : "upcoming";
        const marker = (
          <>
            <span className={styles.marker} aria-hidden="true">
              {state === "done" ? <Icon name="check" size={14} /> : index + 1}
            </span>
            <span className={styles.stepText}>
              <span className={styles.stepTitle}>{entry.title}</span>
              {entry.summary && <span className={styles.stepSummary}>{entry.summary}</span>}
            </span>
          </>
        );
        return (
          <li
            key={entry.title}
            className={styles.step}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            {onStepClick && index < current ? (
              <button
                type="button"
                className={styles.stepButton}
                onClick={() => onStepClick(index)}
              >
                {marker}
              </button>
            ) : (
              <span className={styles.stepButton}>{marker}</span>
            )}
          </li>
        );
      })}
    </ol>
  );
};

export type MultiStepProps = {
  steps: readonly MultiStepStep[];
  variant?: "dialog" | "sheet" | "page";
  title?: React.ReactNode;
  description?: React.ReactNode;
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  trigger?: React.ReactElement;
  onComplete?: () => void | Promise<unknown>;
  completeLabel?: string;
  onCancel?: () => void;
  step?: number;
  defaultStep?: number;
  onStepChange?: (step: number) => void;
  className?: string;
};

const fieldSelector =
  ":is(input:not([type=hidden]), textarea, select, [role=combobox], button[role=radio], button[role=checkbox], button[role=switch]):not(:disabled, [aria-disabled=true])";

export const MultiStep = ({
  steps,
  variant = "dialog",
  title,
  description,
  open,
  defaultOpen = false,
  onOpenChange,
  trigger,
  onComplete,
  completeLabel = "Finish",
  onCancel,
  step,
  defaultStep = 0,
  onStepChange,
  className
}: MultiStepProps) => {
  const [isOpen, setOpen] = useControllableState({
    value: open,
    defaultValue: defaultOpen,
    onChange: onOpenChange
  });
  const [current, setCurrent] = useControllableState({
    value: step,
    defaultValue: defaultStep,
    onChange: onStepChange
  });
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string>();
  const [direction, setDirection] = React.useState(1);
  const viewport = React.useRef<HTMLDivElement | null>(null);
  const activeStep = () =>
    viewport.current?.querySelector<HTMLElement>(`[data-step="${current}"]`) ?? null;
  const moved = React.useRef(false);
  const reduced = useReducedMotion();
  const entry = steps[current];
  const last = current === steps.length - 1;
  React.useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    viewport.current
      ?.querySelector<HTMLElement>(`[data-step="${current}"]`)
      ?.querySelector<HTMLElement>(fieldSelector)
      ?.focus();
  }, [current]);
  const move = (target: number) => {
    setError(undefined);
    setDirection(target > current ? 1 : -1);
    moved.current = true;
    setCurrent(target);
  };
  const reset = () => {
    setError(undefined);
    if (current !== defaultStep) setCurrent(defaultStep);
  };
  const changeOpen = (next: boolean) => {
    if (!next) {
      if (busy) return;
      onCancel?.();
      reset();
    }
    setOpen(next);
  };
  const advance = async () => {
    if (busy || !entry) return;
    setError(undefined);
    setBusy(true);
    try {
      const result = await entry.validate?.();
      if (result === false) {
        activeStep()?.querySelector<HTMLElement>("[aria-invalid=true]")?.focus();
        return;
      }
      if (typeof result === "string") {
        setError(result);
        return;
      }
      if (!last) {
        move(current + 1);
        return;
      }
      await onComplete?.();
      if (variant !== "page") {
        reset();
        setOpen(false);
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };
  if (!entry) return null;
  const travel = reduced ? 0 : 24;
  const stepHead = (
    <div className={styles.stepHead}>
      {variant === "page" && (
        <p className={styles.eyebrow}>
          Step {current + 1} of {steps.length}
        </p>
      )}
      <h3 className={styles.heading}>{entry.heading ?? entry.title}</h3>
      {entry.description && <p className={styles.lede}>{entry.description}</p>}
    </div>
  );
  const flow = (
    <form
      noValidate
      className={styles.form}
      onSubmit={(event) => {
        event.preventDefault();
        advance();
      }}
    >
      <fieldset disabled={busy} className={styles.fields}>
        <motion.div
          ref={viewport}
          layout={!reduced}
          transition={spring.moderate}
          className={styles.viewport}
        >
          <AnimatePresence mode="popLayout" initial={false} custom={direction}>
            <motion.div
              key={current}
              data-step={current}
              className={styles.body}
              initial={{ opacity: 0, x: direction * travel }}
              animate={{ opacity: 1, x: 0, transition: reduced ? snap : spring.moderate }}
              exit={{
                opacity: 0,
                x: -direction * travel,
                transition: reduced ? snap : exit.moderate
              }}
            >
              {stepHead}
              {entry.content}
            </motion.div>
          </AnimatePresence>
        </motion.div>
      </fieldset>
      <div className={styles.footer}>
        <p className={cn(styles.status, error && styles.error)} role="status">
          {error ?? (variant === "page" ? null : `Step ${current + 1} of ${steps.length}`)}
        </p>
        <div className={styles.buttons}>
          {current === 0 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => changeOpen(false)}
              disabled={busy}
            >
              Cancel
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => move(current - 1)}
              disabled={busy}
            >
              Back
            </Button>
          )}
          <Button type="submit" variant="primary" size="sm" loading={busy}>
            {last ? completeLabel : (entry.nextLabel ?? "Continue")}
          </Button>
        </div>
      </div>
    </form>
  );
  const indicator = (
    <Steps
      steps={steps}
      current={current}
      label={typeof title === "string" ? `${title} steps` : "Steps"}
    />
  );
  if (variant === "page")
    return (
      <div data-slot="multi-step" data-variant="page" className={cn(styles.page, className)}>
        <div className={styles.pageGrid}>
          <div className={styles.rail}>
            <Steps
              steps={steps}
              current={current}
              orientation="vertical"
              onStepClick={busy ? undefined : move}
            />
          </div>
          <div className={styles.bar}>{indicator}</div>
          <div className={styles.card}>{flow}</div>
        </div>
      </div>
    );
  const content = (
    <div data-slot="multi-step" data-variant={variant} className={cn(styles.panel, className)}>
      <div className={styles.header}>
        {variant === "dialog" ? (
          <DialogTitle className={styles.title}>{title}</DialogTitle>
        ) : (
          <SheetTitle className={styles.title}>{title}</SheetTitle>
        )}
        {description &&
          (variant === "dialog" ? (
            <DialogDescription className={styles.lede}>{description}</DialogDescription>
          ) : (
            <SheetDescription className={styles.lede}>{description}</SheetDescription>
          ))}
        {indicator}
      </div>
      {flow}
    </div>
  );
  if (variant === "sheet")
    return (
      <Sheet open={isOpen} onOpenChange={changeOpen}>
        {trigger && <SheetTrigger asChild>{trigger}</SheetTrigger>}
        <SheetContent className={styles.sheet}>{content}</SheetContent>
      </Sheet>
    );
  return (
    <Dialog open={isOpen} onOpenChange={changeOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className={styles.dialog}>{content}</DialogContent>
    </Dialog>
  );
};
