import { useRef, useState } from "react";
import { twMerge } from "tailwind-merge";

import { Tooltip, TooltipContent, TooltipTrigger } from "@app/components/v3";

// Opens only when the label is cut off, measured as it opens.
export const SessionLabel = ({ label, className }: { label: string; className?: string }) => {
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
        <span ref={ref} className={twMerge("block truncate", className)}>
          {label}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-lg break-words">{label}</TooltipContent>
    </Tooltip>
  );
};
