import { useEffect, useRef, useState } from "react";
import { CheckIcon, ChevronDownIcon, Loader2Icon, XIcon } from "lucide-react";

import { IconButton } from "@app/components/v3";

export type TBootLine = { text: string; isError?: boolean };

type Props = {
  /** Null when nothing is booting; the dock only exists while there is something to narrate. */
  lines: TBootLine[] | null;
  step: string | null;
  isDone: boolean;
  hasFailed: boolean;
  onDismiss: () => void;
};

/**
 * A corner dock that narrates a real start, streamed from the API as it happens.
 *
 * Deliberately out of the way: starting a sandbox should not take over the page, but a spinner with
 * no detail makes a twenty-second boot feel broken. Collapsed it is one line naming the current
 * stage; expanded it is the log.
 */
export const SandboxBootDock = ({ lines, step, isDone, hasFailed, onDismiss }: Props) => {
  // Open while it matters: the whole point is that the wait has visible detail.
  const [isOpen, setIsOpen] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [lines]);

  // A successful boot clears itself; a failed one stays so the reason can be read.
  useEffect(() => {
    if (!lines || !isDone || hasFailed) return undefined;

    const timer = window.setTimeout(onDismiss, 4_000);
    return () => window.clearTimeout(timer);
  }, [lines, isDone, hasFailed, onDismiss]);

  if (!lines) return null;

  return (
    <div className="fixed right-6 bottom-6 z-50 w-96 max-w-[calc(100vw-3rem)]">
      <div className="overflow-hidden rounded-md border border-border bg-bunker-800 shadow-lg">
        <div className="flex items-center gap-2 px-3 py-2">
          {(() => {
            if (hasFailed) return <XIcon className="size-3.5 shrink-0 text-danger" />;
            if (isDone) return <CheckIcon className="size-3.5 shrink-0 text-success" />;
            return <Loader2Icon className="size-3.5 shrink-0 animate-spin text-product-sandbox" />;
          })()}

          <span className="min-w-0 flex-1 truncate text-xs text-foreground">
            {step ?? (hasFailed ? "Start failed" : "Starting sandbox")}
          </span>

          <IconButton
            variant="ghost"
            size="xs"
            aria-label={isOpen ? "Hide boot log" : "Show boot log"}
            onClick={() => setIsOpen(!isOpen)}
          >
            <ChevronDownIcon
              className={`size-3.5 transition-transform ${isOpen ? "" : "rotate-180"}`}
            />
          </IconButton>

          {(isDone || hasFailed) && (
            <IconButton variant="ghost" size="xs" aria-label="Dismiss" onClick={onDismiss}>
              <XIcon className="size-3.5" />
            </IconButton>
          )}
        </div>

        {isOpen && (
          <div
            ref={scrollRef}
            className="max-h-48 thin-scrollbar overflow-y-auto border-t border-border p-3"
          >
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
            {!isDone && !hasFailed && (
              <p className="font-mono text-[11px] leading-5 text-product-sandbox">
                <span className="mr-2">›</span>
                <span className="inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-product-sandbox" />
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
