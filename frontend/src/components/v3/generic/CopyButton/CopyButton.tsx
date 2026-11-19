import { ComponentProps, forwardRef, type JSX } from "react";
import { Check, CircleAlert, Copy } from "lucide-react";

import { copyToClipboard } from "@app/helpers/clipboard";
import { useTimedReset } from "@app/hooks";

import { cn } from "../../utils";
import { IconButton } from "../IconButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "../Tooltip";

type CopyButtonProps = Omit<ComponentProps<"button">, "value" | "children"> & {
  value: string;
  ariaLabel: string;
} & Pick<ComponentProps<typeof IconButton>, "variant" | "size">;

const COPY_FAILED_MESSAGE = "Couldn't copy to clipboard";

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  (
    { value, ariaLabel, variant = "ghost", size = "xs", onClick, className, ...props },
    ref
  ): JSX.Element => {
    const [copyStatus, , setCopyStatus] = useTimedReset<"idle" | "copied" | "failed">({
      initialState: "idle"
    });
    const isFailed = copyStatus === "failed";

    return (
      <Tooltip open={isFailed}>
        <TooltipTrigger asChild>
          <IconButton
            {...props}
            ref={ref}
            variant={variant}
            size={size}
            className={cn(isFailed && "text-danger hover:text-danger", className)}
            aria-label={isFailed ? COPY_FAILED_MESSAGE : ariaLabel}
            onClick={async (event) => {
              onClick?.(event);
              setCopyStatus("idle");
              try {
                await copyToClipboard(value, event.currentTarget);
                setCopyStatus("copied");
              } catch {
                setCopyStatus("failed");
              }
            }}
          >
            {copyStatus === "copied" && <Check />}
            {copyStatus === "failed" && <CircleAlert />}
            {copyStatus === "idle" && <Copy />}
          </IconButton>
        </TooltipTrigger>
        <TooltipContent side="bottom">{COPY_FAILED_MESSAGE}</TooltipContent>
      </Tooltip>
    );
  }
);

CopyButton.displayName = "CopyButton";
