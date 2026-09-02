import { ComponentProps, forwardRef } from "react";
import { Check, Copy } from "lucide-react";

import { useTimedReset } from "@app/hooks";

import { IconButton } from "../IconButton";

type CopyButtonProps = Omit<ComponentProps<"button">, "value" | "children"> & {
  value: string;
  ariaLabel: string;
} & Pick<ComponentProps<typeof IconButton>, "variant" | "size">;

export const CopyButton = forwardRef<HTMLButtonElement, CopyButtonProps>(
  ({ value, ariaLabel, variant = "ghost", size = "xs", onClick, ...props }, ref): JSX.Element => {
    const [, isCopying, setCopyText] = useTimedReset<string>({
      initialState: "Copy to clipboard"
    });

    return (
      <IconButton
        {...props}
        ref={ref}
        variant={variant}
        size={size}
        aria-label={ariaLabel}
        onClick={(event) => {
          navigator.clipboard.writeText(value);
          setCopyText("Copied");
          onClick?.(event);
        }}
      >
        {isCopying ? <Check /> : <Copy />}
      </IconButton>
    );
  }
);

CopyButton.displayName = "CopyButton";
