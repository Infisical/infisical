import { useEffect, useRef, useState } from "react";

import { cn } from "@app/components/v3/utils";

import type { FieldInfo, TableDetail } from "../data-explorer-types";
import type { QueryTab } from "../use-query-tabs";
import { QueryResultsTable } from "./QueryResultsTable";
import { QueryToolbar } from "./QueryToolbar";
import { SqlEditor } from "./SqlEditor";

type QueryResult = {
  rows: Record<string, unknown>[];
  fields: FieldInfo[];
  rowCount: number | null;
  isTruncated: boolean;
  command: string;
  executionTimeMs: number;
};

type Props = {
  tab: QueryTab;
  executeQuery: (sql: string) => Promise<QueryResult>;
  cancelQuery: () => void;
  tableDetail: TableDetail | null;
  onSqlChange: (sql: string) => void;
};

const TRANSACTION_START_COMMANDS = new Set(["BEGIN", "START"]);
const TRANSACTION_END_COMMANDS = new Set(["COMMIT", "ROLLBACK"]);

export function QueryPanel({ tab, executeQuery, cancelQuery, tableDetail, onSqlChange }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isInTransaction, setIsInTransaction] = useState(false);
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
      const cmd = res.command.toUpperCase();
      if (TRANSACTION_START_COMMANDS.has(cmd)) setIsInTransaction(true);
      if (TRANSACTION_END_COMMANDS.has(cmd)) setIsInTransaction(false);
      setResult(res);
    } catch (err) {
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
        result={result}
        error={error}
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
        <div ref={editorPaneRef} className="min-h-0 overflow-hidden">
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
          className={cn(
            "h-1 shrink-0 cursor-row-resize bg-mineshaft-600 transition-colors hover:bg-primary/50",
            isDragging && "bg-primary/50"
          )}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
        />

        <div className="min-h-0 flex-1 overflow-hidden bg-bunker-800">
          <QueryResultsTable
            result={result}
            error={error}
            isRunning={isRunning}
            tableDetail={tableDetail}
          />
        </div>
      </div>
    </div>
  );
}
