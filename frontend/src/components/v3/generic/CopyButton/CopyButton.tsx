import { ComponentProps } from "react";
import { Check, Copy } from "lucide-react";

import { useTimedReset } from "@app/hooks";

import { IconButton } from "../IconButton";

type CopyButtonProps = {
  value: string;
  ariaLabel: string;
} & Pick<ComponentProps<typeof IconButton>, "variant" | "size" | "className">;

export const CopyButton = ({
  value,
  ariaLabel,
  variant = "ghost",
  size = "xs",
  className
}: CopyButtonProps) => {
  const [, isCopying, setCopyText] = useTimedReset<string>({
    initialState: "Copy to clipboard"
  });

  return (
    <IconButton
      variant={variant}
      size={size}
      className={className}
      aria-label={ariaLabel}
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopyText("Copied");
      }}
    >
      {isCopying ? <Check /> : <Copy />}
    </IconButton>
  );
};
