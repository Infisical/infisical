import { CheckIcon, PlayIcon, RotateCcwIcon, SquareIcon } from "lucide-react";

import { Button } from "@app/components/v3/generic/Button";

const isMac = typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

type Props = {
  isRunning: boolean;
  isInTransaction: boolean;
  hasSelection: boolean;
  onRun: () => void;
  onCommit: () => void;
  onRollback: () => void;
  onCancel: () => void;
};

export function QueryToolbar({
  isRunning,
  isInTransaction,
  hasSelection,
  onRun,
  onCommit,
  onRollback,
  onCancel
}: Props) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-mineshaft-600 bg-bunker-800 px-3 py-1.5">
      <div className="flex items-center gap-3">
        {isRunning ? (
          <Button size="xs" variant="outline" onClick={onCancel} className="gap-1.5">
            <SquareIcon className="size-3 text-red-400" />
            Cancel
          </Button>
        ) : (
          <Button size="xs" onClick={() => onRun()} className="gap-1.5">
            <PlayIcon className="size-3" />
            {hasSelection ? "Run Selection" : "Run"}
            <span className="opacity-60">{isMac ? "⌘" : "Ctrl"} ↵</span>
          </Button>
        )}
        {isInTransaction && (
          <>
            <Button
              size="xs"
              variant="success"
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
      </div>
      {isInTransaction && (
        <span className="rounded bg-yellow-500/15 px-2 py-0.5 text-xs font-medium text-yellow-400">
          Transaction open
        </span>
      )}
    </div>
  );
}
