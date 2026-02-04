import {
  computeLineDiff,
  computeWordDiff,
  splitChangeIntoLines
} from "@app/components/utilities/diff";

export interface MultiLineDiffProps {
  oldText: string;
  newText: string;
  isOldVersion: boolean;
}

/**
 * Render multiline diff for approval screen (side-by-side view)
 */
export const MultiLineDiff = ({ oldText, newText, isOldVersion }: MultiLineDiffProps) => {
  const lineChanges = computeLineDiff(oldText, newText);

  // Check if this is just an append/prepend operation where old content is preserved
  // If the new text starts with or ends with the old text, the old content wasn't removed
  const isAppendOnly = oldText !== "" && newText.startsWith(oldText);
  const isPrependOnly = oldText !== "" && newText.endsWith(oldText);
  const isOldPreserved = isAppendOnly || isPrependOnly;

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
    <div className="min-w-full font-mono text-sm break-words whitespace-pre-wrap">
      {lineChanges.map((change, changeIdx) => {
        const nextChange = lineChanges[changeIdx + 1];
        const lines = splitChangeIntoLines(change.value);

        return lines.map((line, lineIdx) => {
          const lineKey = `multiline-${changeIdx}-${lineIdx}`;
          const isFirstChanged = !firstChangedFound && currentLineIndex === firstChangedIndex;
          if (isFirstChanged) firstChangedFound = true;
          currentLineIndex += 1;

          if (isOldVersion) {
            // Render old version
            if (change.added) {
              return null; // Skip added lines in old version
            }

            // If old content is preserved (append/prepend only), don't highlight old lines
            // even if diffLines marks them as "removed"
            const isActuallyChanged = change.removed && !isOldPreserved;
            const lineClass = isActuallyChanged
              ? "flex min-w-full bg-red-500/70 rounded-xs text-red-300"
              : "flex min-w-full";

            // If this is a removed line followed by an added line, it's a modification
            // But only show word-level diff if old content wasn't fully preserved
            if (change.removed && nextChange?.added && !isOldPreserved) {
              const nextLines = splitChangeIntoLines(nextChange.value);
              const newLine = nextLines[lineIdx] ?? "";
              const wordDiffs = computeWordDiff(line, newLine);

              // If no common words, just show the line with line-level background
              if (wordDiffs === null) {
                return (
                  <div
                    key={lineKey}
                    className={lineClass}
                    data-first-change={isFirstChanged ? "true" : undefined}
                  >
                    <div className="w-4 shrink-0">-</div>
                    <div className="min-w-0 flex-1 break-words">{line}</div>
                  </div>
                );
              }

              return (
                <div
                  key={lineKey}
                  className={lineClass}
                  data-first-change={isFirstChanged ? "true" : undefined}
                >
                  <div className="w-4 shrink-0">-</div>
                  <div className="min-w-0 flex-1 break-words">
                    {wordDiffs.map((wordChange, wordIdx) => {
                      if (wordChange.added) return null;
                      const wordKey = `${lineKey}-word-${wordIdx}`;
                      const wordClass = wordChange.removed ? "bg-red-600/70 rounded px-0.5" : "";
                      return (
                        <span key={wordKey} className={wordClass}>
                          {wordChange.value}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            }

            return (
              <div
                key={lineKey}
                className={lineClass}
                data-first-change={isFirstChanged ? "true" : undefined}
              >
                <div className="w-4 shrink-0">{isActuallyChanged ? "-" : " "}</div>
                <div className="min-w-0 flex-1 break-words">{line}</div>
              </div>
            );
          }

          // Render new version
          if (change.removed) {
            return null; // Skip deleted lines in new version
          }

          // Check if previous change was removed (modification case)
          const prevChange = changeIdx > 0 ? lineChanges[changeIdx - 1] : undefined;
          const isModification = prevChange?.removed && change.added;

          const isChanged = change.added;
          const lineClass = isChanged
            ? "flex min-w-full bg-[#2ecc71]/40 rounded-xs text-green-300"
            : "flex min-w-full";

          // If this is a modification, show word-level diff
          if (isModification && prevChange) {
            const prevLines = splitChangeIntoLines(prevChange.value);
            const oldLine = prevLines[lineIdx] ?? "";
            const wordDiffs = computeWordDiff(oldLine, line);

            // If no common words, just show the line with line-level background
            if (wordDiffs === null) {
              return (
                <div
                  key={lineKey}
                  className={lineClass}
                  data-first-change={isFirstChanged ? "true" : undefined}
                >
                  <div className="w-4 shrink-0">+</div>
                  <div className="min-w-0 flex-1 break-words">{line}</div>
                </div>
              );
            }

            return (
              <div
                key={lineKey}
                className={lineClass}
                data-first-change={isFirstChanged ? "true" : undefined}
              >
                <div className="w-4 shrink-0">+</div>
                <div className="min-w-0 flex-1 break-words">
                  {wordDiffs.map((wordChange, wordIdx) => {
                    if (wordChange.removed) return null;
                    const wordKey = `${lineKey}-word-${wordIdx}`;
                    const wordClass = wordChange.added ? "bg-[#2ecc71]/60 rounded px-0.5" : "";
                    return (
                      <span key={wordKey} className={wordClass}>
                        {wordChange.value}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          }

          return (
            <div
              key={lineKey}
              className={lineClass}
              data-first-change={isFirstChanged ? "true" : undefined}
            >
              <div className="w-4 shrink-0">{isChanged ? "+" : " "}</div>
              <div className="min-w-0 flex-1 break-words">{line}</div>
            </div>
          );
        });
      })}
    </div>
  );
};
