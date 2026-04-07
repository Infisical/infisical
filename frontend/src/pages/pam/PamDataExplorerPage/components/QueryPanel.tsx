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
  command: string;
  executionTimeMs: number;
};

type Props = {
  tab: QueryTab;
  executeQuery: (sql: string) => Promise<QueryResult>;
  tableDetail: TableDetail | null;
  onSqlChange: (sql: string) => void;
};

export function QueryPanel({ tab, executeQuery, tableDetail, onSqlChange }: Props) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const editorPaneRef = useRef<HTMLDivElement>(null);
  const splitPctRef = useRef(40);

  useEffect(() => {
    if (editorPaneRef.current) {
      editorPaneRef.current.style.height = `${splitPctRef.current}%`;
    }
  }, []);

  const handleRun = async () => {
    if (!tab.sql.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);
    try {
      const res = await executeQuery(tab.sql);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setResult(null);
    } finally {
      setIsRunning(false);
    }
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
      <QueryToolbar isRunning={isRunning} result={result} error={error} onRun={handleRun} />
      <div
        ref={containerRef}
        className={cn("flex flex-1 flex-col overflow-hidden", isDragging && "select-none")}
      >
        <div ref={editorPaneRef} className="min-h-0 overflow-hidden">
          <SqlEditor value={tab.sql} onChange={onSqlChange} onExecute={handleRun} />
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
