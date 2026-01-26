import { useCallback } from "react";

const DIFF_TYPE = {
  ADDED: "added",
  DELETED: "deleted",
  UNCHANGED: "unchanged",
  MODIFIED: "modified"
} as const;

type DiffLine = {
  type: (typeof DIFF_TYPE)[keyof typeof DIFF_TYPE];
  oldLine?: string;
  newLine?: string;
};

type WordDiff = {
  type: typeof DIFF_TYPE.ADDED | typeof DIFF_TYPE.DELETED | typeof DIFF_TYPE.UNCHANGED;
  text: string;
};

type UseRenderNewVersionDiffLineParams = {
  diffLine: DiffLine;
  lineKey: string;
  isFirstChanged: boolean;
  lineClass: string;
  computeWordDiff: (oldText: string, newText: string) => WordDiff[] | null;
};

export const useRenderNewVersionDiffLine = () => {
  const renderNewVersionDiffLine = useCallback(
    ({ diffLine, lineKey, isFirstChanged, lineClass, computeWordDiff }: UseRenderNewVersionDiffLineParams): JSX.Element | null => {
      // ADDED lines should always be shown as a single block (no word-by-word highlighting)
      if (diffLine.type === DIFF_TYPE.ADDED && diffLine.newLine) {
        return (
          <div
            key={lineKey}
            className={lineClass}
            data-first-change={isFirstChanged ? "true" : undefined}
          >
            <div className="w-4 shrink-0">+</div>
            <div className="min-w-0 flex-1 break-words">{diffLine.newLine}</div>
          </div>
        );
      }

      if (diffLine.type === DIFF_TYPE.MODIFIED && diffLine.newLine) {
        const wordDiffs = computeWordDiff(diffLine.oldLine || "", diffLine.newLine);
        // If no common words, just show the line with line-level background (no extra inner highlight)
        if (wordDiffs === null) {
          return (
            <div
              key={lineKey}
              className={lineClass}
              data-first-change={isFirstChanged ? "true" : undefined}
            >
              <div className="w-4 shrink-0">+</div>
              <div className="min-w-0 flex-1 break-words">{diffLine.newLine}</div>
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
              {wordDiffs.map((wordDiff, wordIdx) => {
                if (wordDiff.type === DIFF_TYPE.DELETED) return null;
                const wordKey = `${lineKey}-word-${wordIdx}`;
                const wordClass =
                  wordDiff.type === DIFF_TYPE.ADDED ? "bg-green-600/70 rounded px-0.5" : "";
                return (
                  <span key={wordKey} className={wordClass}>
                    {wordDiff.text}
                  </span>
                );
              })}
            </div>
          </div>
        );
      }

      return null;
    },
    []
  );

  return renderNewVersionDiffLine;
};
