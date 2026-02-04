import { computeLineDiff, splitChangeIntoLines } from "@app/components/utilities/diff";

import { renderTextDiff } from "./SingleLineDiff";

export interface MultiLineDiffProps {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
}

// Color classes for multiline diff (slightly different opacity for line context)
const ADDED_CLASS = "rounded bg-green-500/60 px-0.5";
const REMOVED_CLASS = "rounded bg-red-500/60 px-0.5";

/**
 * Render multiline diff for approval screen (side-by-side view)
 */
export const MultiLineDiff = ({ oldText, newText, isOldVersion }: MultiLineDiffProps) => {
  const lineChanges = computeLineDiff(oldText, newText);

  // Check if old text is contained within new text (pure insertion at text level)
  const oldExistsInNew = oldText !== "" && newText !== "" && newText.includes(oldText);
  // Check if new text is contained within old text (pure deletion at text level)
  const newExistsInOld = oldText !== "" && newText !== "" && oldText.includes(newText);

  // Find the first changed line index
  let firstChangedIndex = -1;
  let lineIndex = 0;
  for (let i = 0; i < lineChanges.length; i += 1) {
    const change = lineChanges[i];
    const lines = splitChangeIntoLines(change.value);

    const isChanged = isOldVersion ? change.removed : change.added;
    if (isChanged && firstChangedIndex === -1) {
      firstChangedIndex = lineIndex;
      break;
    }
    lineIndex += lines.length;
  }

  let currentLineIndex = 0;
  let firstChangedFound = false;

  return (
    <div className="w-max min-w-full font-mono text-sm whitespace-pre">
      {lineChanges.map((change, changeIdx) => {
        const nextChange = lineChanges[changeIdx + 1];
        const prevChange = changeIdx > 0 ? lineChanges[changeIdx - 1] : undefined;
        const lines = splitChangeIntoLines(change.value);

        return lines.map((line, lineIdx) => {
          const lineKey = `multiline-${changeIdx}-${lineIdx}`;
          const isFirstChanged = !firstChangedFound && currentLineIndex === firstChangedIndex;
          if (isFirstChanged) firstChangedFound = true;
          currentLineIndex += 1;

          // Skip opposite change type (added lines in old version, removed lines in new version)
          const isSkipped = isOldVersion ? change.added : change.removed;
          if (isSkipped) {
            return null;
          }

          // Determine if this line represents a modification (removed followed by added or vice versa)
          const adjacentChange = isOldVersion ? nextChange : prevChange;
          const isModification = isOldVersion
            ? change.removed && nextChange?.added
            : prevChange?.removed && change.added;

          // Determine if this line should be highlighted as changed
          // For modifications, always highlight. For pure add/remove, check whole-text containment.
          const isChanged =
            isModification ||
            (isOldVersion ? change.removed && !oldExistsInNew : change.added && !newExistsInOld);

          const lineClass = isChanged
            ? `flex min-w-full rounded-xs ${
                isOldVersion ? "bg-red-500/30 text-red-300" : "bg-green-500/30 text-green-300"
              }`
            : "flex min-w-full";

          let symbol = " ";
          if (isChanged) {
            symbol = isOldVersion ? "-" : "+";
          }

          // Handle modification with word-level diff
          if (isModification && adjacentChange) {
            const adjacentLines = splitChangeIntoLines(adjacentChange.value);
            const adjacentLine = adjacentLines[lineIdx] ?? "";
            const [diffOldText, diffNewText] = isOldVersion
              ? [line, adjacentLine]
              : [adjacentLine, line];

            return (
              <div
                key={lineKey}
                className={lineClass}
                data-first-change={isFirstChanged ? "true" : undefined}
              >
                <div className="w-4 shrink-0">{symbol}</div>
                <div className="flex-1">
                  {renderTextDiff({
                    oldText: diffOldText,
                    newText: diffNewText,
                    isOldVersion,
                    keyPrefix: lineKey,
                    addedClass: ADDED_CLASS,
                    removedClass: REMOVED_CLASS
                  })}
                </div>
              </div>
            );
          }

          // Plain line rendering
          return (
            <div
              key={lineKey}
              className={lineClass}
              data-first-change={isFirstChanged ? "true" : undefined}
            >
              <div className="w-4 shrink-0">{symbol}</div>
              <div className="flex-1">{line}</div>
            </div>
          );
        });
      })}
    </div>
  );
};
