import { useLayoutEffect, useState } from "react";

import {
  FieldDescription,
  FieldError,
  Tooltip,
  TooltipContent,
  TooltipTrigger
} from "@app/components/v3";

type Props = {
  lines: string[];
  isError?: boolean;
};

/**
 * A policy constraint can list many patterns, and a single pattern can be long, so the message is
 * kept to one line under the input. It only becomes a tooltip once it actually overflows, since a
 * tooltip repeating text that is already fully visible reads as a glitch.
 */
export const PolicyRowMessage = ({ lines, isError }: Props) => {
  // A callback ref rather than useRef: wrapping the line in a tooltip remounts it, and the effect
  // has to follow the live node instead of holding an observer on a detached one.
  const [textNode, setTextNode] = useState<HTMLSpanElement | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  const text = lines.join("; ");

  useLayoutEffect(() => {
    if (!textNode) return undefined;

    const measure = () => setIsTruncated(textNode.scrollWidth > textNode.clientWidth);
    measure();

    // The row lives in a resizable sheet, so overflow depends on more than the text itself.
    const observer = new ResizeObserver(measure);
    observer.observe(textNode);
    return () => observer.disconnect();
  }, [textNode, text]);

  if (lines.length === 0) return null;

  const line = (
    <span ref={setTextNode} className="block truncate">
      {text}
    </span>
  );

  const message = isTruncated ? (
    <Tooltip>
      <TooltipTrigger asChild>{line}</TooltipTrigger>
      {/* Opens downward and from the left edge, so it never covers the input it belongs to. */}
      <TooltipContent
        side="bottom"
        align="start"
        sideOffset={6}
        className="flex max-w-sm flex-col gap-2.5 px-3.5 py-2.5 break-words"
      >
        {lines.map((entry) => (
          <span key={entry}>{entry}</span>
        ))}
      </TooltipContent>
    </Tooltip>
  ) : (
    line
  );

  return isError ? (
    <FieldError className="mt-1.5">{message}</FieldError>
  ) : (
    <FieldDescription className="mt-1.5">{message}</FieldDescription>
  );
};
