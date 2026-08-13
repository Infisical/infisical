import { useEffect, useRef } from "react";
import { CheckIcon, Loader2Icon, XIcon } from "lucide-react";

export type TBootStep = {
  label: string;
  message: string;
  state: "pending" | "active" | "done" | "error";
};

export type TBootLine = { text: string; isError?: boolean };

type Props = {
  steps: TBootStep[];
  lines: TBootLine[];
  isDone: boolean;
};

const STATE_TEXT = {
  pending: "text-muted",
  active: "text-foreground",
  done: "text-foreground",
  error: "text-danger"
};

const STATE_ICON = {
  pending: <span className="size-3.5 shrink-0 rounded-full border border-border" />,
  active: <Loader2Icon className="size-3.5 shrink-0 animate-spin text-product-sandbox" />,
  done: <CheckIcon className="size-3.5 shrink-0 text-success" />,
  error: <XIcon className="size-3.5 shrink-0 text-danger" />
};

/**
 * The boot view. Every line comes from the start actually happening, so a slow image pull or a
 * refused grant is visible rather than hidden behind a progress bar that always completes.
 */
export const BootTerminal = ({ steps, lines, isDone }: Props) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        {steps.map((step) => (
          <div key={step.label} className="flex items-center gap-2.5">
            {STATE_ICON[step.state]}
            <span className={`text-sm transition-colors duration-300 ${STATE_TEXT[step.state]}`}>
              {step.message}
            </span>
          </div>
        ))}
      </div>

      <div className="overflow-hidden rounded-md border border-border bg-bunker-800">
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-2">
          <span className="size-2 rounded-full bg-danger/60" />
          <span className="size-2 rounded-full bg-warning/60" />
          <span className="size-2 rounded-full bg-success/60" />
          <span className="ml-2 font-mono text-[10px] text-muted">sandbox boot</span>
          {!isDone && (
            <span className="ml-auto flex items-center gap-1.5 font-mono text-[10px] text-muted">
              <span className="size-1.5 animate-pulse rounded-full bg-product-sandbox" />
              running
            </span>
          )}
        </div>

        <div ref={scrollRef} className="h-56 thin-scrollbar overflow-y-auto p-3">
          {lines.map((line, index) => (
            <p
              // eslint-disable-next-line react/no-array-index-key -- log lines are append-only
              key={index}
              className={`font-mono text-[11px] leading-5 wrap-anywhere ${
                line.isError ? "text-danger" : "text-muted"
              }`}
            >
              <span className="mr-2 text-product-sandbox/70">›</span>
              {line.text}
            </p>
          ))}
          {!isDone && (
            <p className="font-mono text-[11px] leading-5 text-product-sandbox">
              <span className="mr-2">›</span>
              <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-product-sandbox" />
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
