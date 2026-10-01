import { ComponentProps, forwardRef, useRef } from "react";
import { Check, Copy, X } from "lucide-react";

import { useTimedReset } from "@app/hooks";

import { IconButton } from "../IconButton";

type CopyButtonProps = Omit<ComponentProps<"button">, "value" | "children"> & {
  value: string;
  ariaLabel: string;
} & Pick<ComponentProps<typeof IconButton>, "variant" | "size">;

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ value, ariaLabel, variant = "ghost", size = "xs", onClick, ...props }, ref): JSX.Element => {
    const copyAttempt = useRef(0);
    const feedbackValue = useRef(value);
    const [copyState, , setCopyState] = useTimedReset<"idle" | "copied" | "failed">({
      initialState: "idle"
    });
    const feedbackState = feedbackValue.current === value ? copyState : "idle";

    return (
      <IconButton
        {...props}
        ref={ref}
        variant={variant}
        size={size}
        aria-label={
          {
            idle: ariaLabel,
            copied: "Copied to clipboard",
            failed: "Copy failed. Try again."
          }[feedbackState]
        }
        onClick={async (event) => {
          onClick?.(event);
          copyAttempt.current += 1;
          const attempt = copyAttempt.current;
          setCopyState("idle");
          try {
            await navigator.clipboard.writeText(value);
            if (attempt !== copyAttempt.current) return;
            feedbackValue.current = value;
            setCopyState("copied");
          } catch {
            if (attempt !== copyAttempt.current) return;
            feedbackValue.current = value;
            setCopyState("failed");
          }
        }}
      >
        {{ idle: <Copy />, copied: <Check />, failed: <X /> }[feedbackState]}
      </IconButton>
    );
  }
);

CopyButton.displayName = "CopyButton";
