import { RefObject } from "react";

import { cn } from "@app/components/v3/utils";
import { splitVariableReferences } from "@app/helpers/agentVaultVariables";

import { useKnownVariableKeys } from "./ServiceVariablesContext";
import { chipTone } from "./VariableChips";

/**
 * The value drawn behind a transparent input, with each reference marked. Marks add colour but no
 * padding, so every character sits exactly where the input's own would.
 */
export const ReferenceHighlights = ({
  value,
  overlayRef
}: {
  value: string;
  overlayRef: RefObject<HTMLDivElement>;
}) => {
  const knownKeys = useKnownVariableKeys();

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center px-2.5">
      <div
        ref={overlayRef}
        className="w-full overflow-hidden text-sm whitespace-pre text-foreground"
      >
        {splitVariableReferences(value).map((segment, index) =>
          segment.type === "text" ? (
            // eslint-disable-next-line react/no-array-index-key
            <span key={index}>{segment.text}</span>
          ) : (
            <mark
              // eslint-disable-next-line react/no-array-index-key
              key={index}
              className={cn(
                "rounded-[3px]",
                chipTone(segment.isValid && (!knownKeys || knownKeys.has(segment.key)))
              )}
            >
              {segment.text}
            </mark>
          )
        )}
        {/* The caret's width: the input scrolls past it at the end, and plain text has nothing there. */}
        <span className="inline-block w-0.5" />
      </div>
    </div>
  );
};
