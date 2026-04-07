import { CheckIcon, PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";

const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

type QueryResult = {
  rowCount: number | null;
  command: string;
  executionTimeMs: number;
};

type Props = {
  isRunning: boolean;
  result: QueryResult | null;
  error: string | null;
  isInTransaction: boolean;
  hasSelection: boolean;
  onRun: () => void;
  onCommit: () => void;
  onRollback: () => void;
  onCancel: () => void;
};

export function QueryToolbar({
  isRunning,
  result,
  error,
  isInTransaction,
  hasSelection,
  onRun,
  onCommit,
  onRollback,
  onCancel
}: Props) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5">
      <Button
        size="xs"
        onClick={() => onRun()}
        isPending={isRunning}
        isDisabled={isRunning}
        className="gap-1.5"
      >
        <PlayIcon className="size-3" />
        {hasSelection ? "Run Selection" : "Run"}
      </Button>
      {isRunning ? (
        <Button size="xs" variant="outline" onClick={onCancel} className="gap-1.5">
          <SquareIcon className="size-3 text-red-400" />
          Cancel
        </Button>
      ) : (
        <span className="text-xs text-mineshaft-500">{isMac ? "⌘" : "Ctrl"}+Enter</span>
      )}
      {isInTransaction && (
        <>
          <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-400">
            Transaction open
          </span>
          <Button
            size="xs"
            variant="outline"
            onClick={onCommit}
            isDisabled={isRunning}
            className="gap-1.5"
          >
            <CheckIcon className="size-3" />
            Commit
          </Button>
          <Button
            size="xs"
            variant="danger"
            onClick={onRollback}
            isDisabled={isRunning}
            className="gap-1.5"
          >
            <RotateCcwIcon className="size-3" />
            Rollback
          </Button>
        </>
      )}
      {!isRunning && result && !error && (
        <span className="ml-auto text-xs text-mineshaft-400">
          {result.rowCount != null
            ? `${result.rowCount} row${result.rowCount !== 1 ? "s" : ""}`
            : result.command}
          {" · "}
          {result.executionTimeMs}ms
        </span>
      )}
    </div>
  );
}
