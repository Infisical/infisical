import { useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

// Opens only when the text is cut off, measured as it opens. A focusable one lets keyboard users open it too.
export const TruncatedText = ({
  text,
  className,
  isFocusable = false
}: {
  text: string;
  className?: string;
  isFocusable?: boolean;
}) => {
  const ref = useRef<HTMLSpanElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Tooltip
      open={isOpen}
      onOpenChange={(next) => {
        const el = ref.current;
        setIsOpen(next && !!el && el.scrollWidth > el.clientWidth);
      }}
    >
      <TooltipTrigger asChild>
        <span
          ref={ref}
          // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex
          tabIndex={isFocusable ? 0 : undefined}
          className={twMerge(
            "block truncate",
            isFocusable &&
              "rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-ring/50",
            className
          )}
        >
          {text}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-md wrap-anywhere">{text}</TooltipContent>
    </Tooltip>
  );
};
