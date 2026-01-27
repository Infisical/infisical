import { useCallback } from "react";
import { type Change } from "diff";

type UseRenderNewVersionDiffLineParams = {
  change: Change;
  nextChange: Change | undefined;
  lineKey: string;
  isFirstChanged: boolean;
  lineClass: string;
  computeWordDiff: (oldText: string, newText: string) => Change[] | null;
};

export const useRenderNewVersionDiffLine = () => {
  const renderNewVersionDiffLine = useCallback(
    ({ change, lineKey, isFirstChanged, lineClass }: UseRenderNewVersionDiffLineParams): JSX.Element | null => {
      // Skip removed lines (they're handled in old version)
      if (change.removed) {
        return null;
      }

      // Get the line from the change value
      const lines = change.value.split("\n");
      if (!change.value.endsWith("\n") && lines.length > 0 && lines[lines.length - 1] === "") {
        lines.pop();
      }
      const line = lines[0] ?? "";

      // ADDED lines should always be shown as a single block (no word-by-word highlighting)
      // Modifications are handled in the parent component
      if (change.added) {
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

      // Unchanged lines - return null to use default rendering
      return null;
    },
    []
  );

  return renderNewVersionDiffLine;
};
