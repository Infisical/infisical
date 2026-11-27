import { useState } from "react";
import { Alert } from "@infisical/cipher/ui/alert";
import { Badge } from "@infisical/cipher/ui/badge";
import { Button } from "@infisical/cipher/ui/button";
import { CodeEditor, type CodeEditorDialect } from "@infisical/cipher/ui/code-editor";
import { DataTable, type DataTableColumn } from "@infisical/cipher/ui/data-table";
import { EmptyState } from "@infisical/cipher/ui/empty";
import { Kbd } from "@infisical/cipher/ui/kbd";
import { Spinner } from "@infisical/cipher/ui/spinner";
import { PlayIcon } from "lucide-react";

import { ExportMenu } from "./export-menu";
import type { QueryResult } from "./protocol";
import { useFillHeight } from "./use-fill-height";
import type { QueryTab } from "./use-tabs";

const MAX_SQL_LENGTH = 50 * 1024;

type ResultRow = { index: number; values: Record<string, unknown> };

const cellText = (value: unknown) => {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
};

const rowLabel = ({ rowCount, rows, isTruncated, command }: QueryResult) => {
  if (rowCount === null) return command;
  if (isTruncated && rows.length === 0) return "Result too large";
  const count = isTruncated ? rows.length : rowCount;
  return `${count.toLocaleString()} ${count === 1 ? "row" : "rows"}`;
};

const emptyResultMessage = ({ command, rowCount, fields }: QueryResult) => {
  const upper = command.toUpperCase();
  const statusMessage: Record<string, string> = {
    BEGIN: "Transaction started",
    COMMIT: "Transaction committed",
    ROLLBACK: "Transaction rolled back"
  };
  const verb: Record<string, string> = { INSERT: "inserted", UPDATE: "updated", DELETE: "deleted" };
  if (statusMessage[upper]) return statusMessage[upper];
  if (verb[upper] && fields.length === 0) {
    const count = rowCount ?? 0;
    return `${count} ${count === 1 ? "row" : "rows"} ${verb[upper]}`;
  }
  return "No rows returned";
};

const ResultsTable = ({ result }: { result: QueryResult }) => {
  const [containerRef, height] = useFillHeight<HTMLDivElement>();
  const rows: ResultRow[] = result.rows.map((values, index) => ({ index, values }));
  const columns: DataTableColumn<ResultRow>[] = result.fields.map(({ name }) => ({
    id: name,
    header: name,
    mono: true,
    minWidth: Math.max(140, Math.min(320, name.length * 10 + 80)),
    text: (row) => cellText(row.values[name]),
    render: (row) =>
      row.values[name] === null || row.values[name] === undefined ? (
        <span style={{ color: "var(--cipher-muted)" }}>NULL</span>
      ) : (
        cellText(row.values[name])
      )
  }));
  return (
    <div ref={containerRef} style={{ position: "relative", flex: 1, minHeight: 0, minWidth: 0 }}>
      {height !== undefined && (
        <div style={{ position: "absolute", inset: 0 }}>
          <DataTable
            label="Query results"
            rows={rows}
            columns={columns}
            getRowId={(row) => String(row.index)}
            rowLabel={(row) => `Row ${row.index + 1}`}
            variant="bordered"
            virtual
            height={height}
            persistentStatus={
              result.isTruncated
                ? `Showing the first ${result.rows.length.toLocaleString()} rows. The result was truncated.`
                : undefined
            }
          />
        </div>
      )}
    </div>
  );
};

export const QueryPanel = ({
  tab,
  dialect,
  executeQuery,
  cancelQuery,
  onSqlChange,
  onTransactionStateChange
}: {
  tab: QueryTab;
  dialect: CodeEditorDialect;
  executeQuery: (connectionId: string, sql: string) => Promise<QueryResult>;
  cancelQuery: (connectionId: string) => void;
  onSqlChange: (sql: string) => void;
  onTransactionStateChange: (open: boolean) => void;
}) => {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");

  const run = async (sql: string) => {
    if (!sql.trim() || isRunning) return;
    setIsRunning(true);
    setError(null);
    try {
      const next = await executeQuery(tab.connectionId, sql);
      onTransactionStateChange(next.transactionOpen);
      setResult(next);
    } catch (cause) {
      // A rejection without a server reply (a dropped socket or a timeout) means the transaction is gone
      onTransactionStateChange(false);
      setError(cause instanceof Error ? cause.message : String(cause));
      setResult(null);
    } finally {
      setIsRunning(false);
    }
  };

  const renderResults = () => {
    if (isRunning)
      return (
        <div style={{ display: "flex", flex: 1, alignItems: "center", justifyContent: "center" }}>
          <Spinner size="base" label="Running query" />
        </div>
      );
    if (error)
      return (
        <div style={{ padding: "var(--cipher-space-12)" }}>
          <Alert tone="bad" title="Query failed">
            <span
              style={{
                fontFamily: "var(--cipher-type-mono-font-family)",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere"
              }}
            >
              {error}
            </span>
          </Alert>
        </div>
      );
    if (!result)
      return <EmptyState icon={PlayIcon} title="Run a query to see results" media="bare" />;
    if (result.rows.length === 0)
      return (
        <EmptyState
          icon="check-c"
          media="bare"
          title={
            result.isTruncated
              ? "The first row is too large to display. Select fewer or smaller columns."
              : emptyResultMessage(result)
          }
        />
      );
    return <ResultsTable result={result} />;
  };

  const fieldNames = result?.fields.map(({ name }) => name) ?? [];

  return (
    <div style={{ display: "flex", flex: 1, flexDirection: "column", minHeight: 0, minWidth: 0 }}>
      <div
        role="toolbar"
        aria-label={`${tab.title} actions`}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "var(--cipher-space-8)",
          padding: "var(--cipher-space-8) var(--cipher-space-12)"
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "var(--cipher-space-8)" }}>
          {isRunning ? (
            <Button
              variant="outline"
              size="sm"
              icon="pause"
              onClick={() => cancelQuery(tab.connectionId)}
            >
              Cancel
            </Button>
          ) : (
            <Button
              size="sm"
              icon={PlayIcon}
              disabledReason={tab.sql.trim() ? undefined : "Write a query first"}
              onClick={() => run(selected || tab.sql)}
            >
              {selected ? "Run selection" : "Run"}
              <Kbd keys="mod+enter" size="sm" />
            </Button>
          )}
          {tab.isInTransaction && (
            <>
              <Button
                variant="outline"
                size="sm"
                icon="check"
                disabledReason={isRunning ? "A query is running" : undefined}
                onClick={() => run("COMMIT")}
              >
                Commit
              </Button>
              <Button
                variant="outline"
                size="sm"
                icon="undo"
                disabledReason={isRunning ? "A query is running" : undefined}
                onClick={() => run("ROLLBACK")}
              >
                Rollback
              </Button>
            </>
          )}
        </div>
        {tab.isInTransaction && <Badge tone="warn">Transaction open</Badge>}
      </div>
      <div style={{ padding: "0 var(--cipher-space-12)" }}>
        <CodeEditor
          aria-label={`${tab.title} SQL`}
          value={tab.sql}
          onChange={onSqlChange}
          dialect={dialect}
          onRun={run}
          onSelectionChange={setSelected}
          placeholder="Start writing SQL"
          maxLength={MAX_SQL_LENGTH}
          rows={10}
          style={{ height: "26vh" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flex: 1,
          flexDirection: "column",
          minHeight: 0,
          padding: "var(--cipher-space-12)"
        }}
      >
        {renderResults()}
      </div>
      {!isRunning && result && !error && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--cipher-space-8)",
            padding: "0 var(--cipher-space-12) var(--cipher-space-8)",
            color: "var(--cipher-muted)"
          }}
        >
          <span style={{ fontVariantNumeric: "tabular-nums" }}>
            {`${rowLabel(result)} in ${result.executionTimeMs} ms`}
          </span>
          {result.rows.length > 0 && <ExportMenu rows={result.rows} columns={fieldNames} />}
        </div>
      )}
    </div>
  );
};
