import { PlayIcon } from "lucide-react";

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
  onRun: () => void;
};

export function QueryToolbar({ isRunning, result, error, onRun }: Props) {
  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-mineshaft-600 bg-mineshaft-800 px-3 py-1.5">
      <Button size="xs" onClick={onRun} isPending={isRunning} className="gap-1.5">
        <PlayIcon className="size-3" />
        Run
      </Button>
      <span className="text-xs text-mineshaft-500">{isMac ? "⌘" : "Ctrl"}+Enter</span>
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
