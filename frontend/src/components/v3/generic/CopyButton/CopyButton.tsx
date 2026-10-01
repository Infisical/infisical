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
    const isWritePending = useRef(false);
    const [copyState, , setCopyState] = useTimedReset<"idle" | "copied" | "failed">({
      initialState: "idle"
    });

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
          }[copyState]
        }
        onClick={async (event) => {
          if (isWritePending.current) return;
          onClick?.(event);
          isWritePending.current = true;
          setCopyState("idle");
          try {
            await navigator.clipboard.writeText(value);
            setCopyState("copied");
          } catch {
            setCopyState("failed");
          } finally {
            isWritePending.current = false;
          }
        }}
      >
        {{ idle: <Copy />, copied: <Check />, failed: <X /> }[copyState]}
      </IconButton>
    );
  }
);

CopyButton.displayName = "CopyButton";
