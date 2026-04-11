import { useEffect, useRef, useState } from "react";
import { GripHorizontalIcon } from "lucide-react";

import { cn } from "@app/components/v3/utils";

import type { FieldInfo } from "../data-explorer-types";
import type { QueryTab } from "../use-query-tabs";
import { QueryResultsTable } from "./QueryResultsTable";
import { QueryToolbar } from "./QueryToolbar";
import { SqlEditor } from "./SqlEditor";

function getRowLabel(rowCount: number, isTruncated: boolean): string {
  if (isTruncated) return `Showing 1,000 of ${rowCount.toLocaleString()} rows`;
  return `${rowCount} row${rowCount !== 1 ? "s" : ""}`;
}

type QueryResult = {
  rows: Record<string, unknown>[];
  fields: FieldInfo[];
  rowCount: number | null;
  isTruncated: boolean;
  transactionOpen: boolean;
  command: string;
  executionTimeMs: number;
};

type Props = {
  tab: QueryTab;
  executeQuery: (sql: string) => Promise<QueryResult>;
  cancelQuery: () => void;
  isInTransaction: boolean;
  onSqlChange: (sql: string) => void;
  onTransactionStateChange: (open: boolean) => void;
};

export function QueryPanel({
  tab,
  executeQuery,
  cancelQuery,
  isInTransaction,
  onSqlChange,
  onTransactionStateChange
}: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hasSelection, setHasSelection] = useState(false);
  const sqlToRunRef = useRef<string>(tab.sql);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const splitPctRef = useRef(40);

  useEffect(() => {
    if (editorPaneRef.current) {
      editorPaneRef.current.style.height = `${splitPctRef.current}%`;
    }
  }, []);

  const runSql = async (sqlToRun: string) => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await executeQuery(sqlToRun);
      onTransactionStateChange(res.transactionOpen);
      setResult(res);
    } catch (err) {
      onTransactionStateChange(false);
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  };

  const handleRun = async (sqlToRun?: string) => {
    const query = sqlToRun ?? sqlToRunRef.current;
    if (!query.trim() || isRunning) return;
    await runSql(query);
  };

  const handleCommit = async () => {
    await runSql("COMMIT");
  };

  const handleRollback = async () => {
    await runSql("ROLLBACK");
  };

  useEffect(() => {
    if (!isDragging) return undefined;

    const onMouseMove = (e: MouseEvent) => {
      const container = containerRef.current;
      const editorPane = editorPaneRef.current;
      if (!container || !editorPane) return;
      const rect = container.getBoundingClientRect();
      const pct = Math.min(85, Math.max(10, ((e.clientY - rect.top) / rect.height) * 100));
      splitPctRef.current = pct;
      editorPane.style.height = `${pct}%`;
    };

    const onMouseUp = () => setIsDragging(false);

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [isDragging]);

  return (
    <div className="flex h-full w-full flex-col overflow-hidden">
      <QueryToolbar
        isRunning={isRunning}
        isInTransaction={isInTransaction}
        hasSelection={hasSelection}
        onRun={handleRun}
        onCommit={handleCommit}
        onRollback={handleRollback}
        onCancel={cancelQuery}
      />
      <div
        ref={containerRef}
        className={cn("flex flex-1 flex-col overflow-hidden", isDragging && "select-none")}
      >
        <div
          ref={editorPaneRef}
          className="min-h-0 overflow-hidden"
          style={{ backgroundColor: "#16181a" }}
        >
          <SqlEditor
            value={tab.sql}
            onChange={onSqlChange}
            onExecute={(s) => handleRun(s)}
            onSelectionChange={setHasSelection}
            onSqlToRunChange={(s) => {
              sqlToRunRef.current = s;
            }}
          />
        </div>

        {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions */}
        <div
          className="group relative z-10 h-0 shrink-0 cursor-row-resize"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
        >
          <div
            className={cn(
              "absolute inset-x-0 top-0 h-px bg-mineshaft-600 transition-colors group-hover:bg-mineshaft-400",
              isDragging && "bg-mineshaft-400"
            )}
          />
          <div
            className={cn(
              "absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-mineshaft-600 px-2 text-mineshaft-300 transition-colors group-hover:bg-mineshaft-500 group-hover:text-mineshaft-100",
              isDragging && "bg-mineshaft-500 text-mineshaft-100"
            )}
          >
            <GripHorizontalIcon className="size-3" />
          </div>
        </div>

        <div className="relative z-0 flex min-h-0 flex-1 flex-col overflow-hidden bg-bunker-800">
          <div className="min-h-0 flex-1 overflow-hidden">
            <QueryResultsTable result={result} error={error} isRunning={isRunning} />
          </div>
          {!isRunning && result && !error && (
            <div className="flex shrink-0 items-center border-t border-mineshaft-600 px-3 py-1">
              <span className="text-xs text-mineshaft-400">
                {result.rowCount != null
                  ? getRowLabel(result.rowCount, result.isTruncated)
                  : result.command}
                {" · "}
                {result.executionTimeMs}ms
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
