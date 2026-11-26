import { EventEmitter } from "events";
import { describe, expect, test, vi } from "vitest";

import { DATA_EXPLORER_MAX_RESULT_BYTES } from "../pam-web-access-fns";
import {
  describeBatchStop,
  MAX_ROWS,
  MssqlScriptError,
  QUERY_TIMEOUT_MESSAGE,
  runBatch,
  runScript
} from "./pam-mssql-batch-runner";

vi.mock("tedious", async () => {
  const { EventEmitter: Emitter } = await import("events");
  class Request extends Emitter {
    constructor(
      readonly sql: string,
      readonly callback: (err?: unknown) => void
    ) {
      super();
    }
  }
  return { Request, Connection: vi.fn(), TYPES: {} };
});

type TFakeRequest = EventEmitter & { sql: string; callback: (err?: unknown) => void };
type TScript = (req: TFakeRequest, conn: FakeConnection) => void | Promise<void>;

const cancelError = () => Object.assign(new Error("Canceled."), { code: "ECANCEL" });

type FakeConnection = EventEmitter & {
  cancelCount: number;
  executed: string[];
  lastRequest: TFakeRequest | null;
  isCancelled: () => boolean;
  execSqlBatch: (req: TFakeRequest) => void;
  cancel: () => boolean;
};

const createConnection = (scripts: TScript[]): FakeConnection => {
  let active: TFakeRequest | null = null;
  const conn = Object.assign(new EventEmitter(), {
    cancelCount: 0,
    executed: [] as string[],
    lastRequest: null as TFakeRequest | null,
    isCancelled: () => active === null,
    execSqlBatch: (req: TFakeRequest) => {
      active = req;
      conn.lastRequest = req;
      const script = scripts[conn.executed.length] ?? ((r: TFakeRequest) => r.callback());
      conn.executed.push(req.sql);
      void Promise.resolve().then(() => script(req, conn));
    },
    cancel: () => {
      conn.cancelCount += 1;
      const req = active;
      active = null;
      if (req) setTimeout(() => req.callback(cancelError()), 0);
      return true;
    }
  });
  return conn;
};

const columns = (...names: string[]) => names.map((colName) => ({ colName, type: { name: "Int" } }));

const selectRows =
  (count: number, name = "n"): TScript =>
  (req, conn) => {
    req.emit("columnMetadata", columns(name));
    for (let i = 0; i < count && !conn.isCancelled(); i += 1) req.emit("row", [{ value: i }]);
    if (conn.isCancelled()) return;
    req.emit("done", count);
    req.callback();
  };

const asConn = (conn: FakeConnection) => conn as unknown as Parameters<typeof runScript>[0];

describe("runBatch", () => {
  test("cancels once at the row cap and keeps the first rows", async () => {
    const conn = createConnection([selectRows(MAX_ROWS + 500)]);
    const run = await runBatch(asConn(conn), "SELECT", { kind: "none" }, 30_000);
    expect(conn.cancelCount).toBe(1);
    expect(run.stoppedAtLimit).toBe("rows");
    expect(run.outcome).toMatchObject({ kind: "rows", isTruncated: true });
    expect(run.outcome.kind === "rows" && run.outcome.rows.length).toBe(MAX_ROWS);
  });

  test("cancels at the byte cap", async () => {
    const big = "x".repeat(Math.ceil(DATA_EXPLORER_MAX_RESULT_BYTES / 4));
    const conn = createConnection([
      (req, c) => {
        req.emit("columnMetadata", [{ colName: "v", type: { name: "NVarChar" } }]);
        for (let i = 0; i < 10 && !c.isCancelled(); i += 1) req.emit("row", [{ value: big }]);
      }
    ]);
    const run = await runBatch(asConn(conn), "SELECT", { kind: "none" }, 30_000);
    expect(run.stoppedAtLimit).toBe("bytes");
    expect(run.outcome.kind === "rows" && run.outcome.rows.length).toBeLessThan(4);
  });

  test("rejects with the time limit message when the wall clock runs out", async () => {
    const conn = createConnection([
      (req) => {
        req.emit("columnMetadata", columns("n"));
      }
    ]);
    await expect(runBatch(asConn(conn), "WAITFOR", { kind: "none" }, 10)).rejects.toThrow(QUERY_TIMEOUT_MESSAGE);
    expect(conn.cancelCount).toBe(1);
  });

  test("keeps a procedure's first result set and counts the hidden ones", async () => {
    const conn = createConnection([
      (req) => {
        req.emit("columnMetadata", columns("first"));
        req.emit("row", [{ value: 1 }]);
        req.emit("doneInProc", 1);
        req.emit("columnMetadata", columns("second"));
        req.emit("row", [{ value: 2 }]);
        req.emit("doneInProc", 1);
        req.emit("doneProc");
        req.callback();
      }
    ]);
    const run = await runBatch(asConn(conn), "EXEC p", { kind: "none" }, 30_000);
    expect(run.outcome).toMatchObject({ kind: "rows", fields: [{ name: "first" }] });
    expect(run.hiddenResultSets).toBe(1);
  });

  test("a row count after a SELECT replaces it and counts as hidden", async () => {
    const conn = createConnection([
      (req) => {
        req.emit("columnMetadata", columns("n"));
        req.emit("row", [{ value: 1 }]);
        req.emit("done", 1);
        req.emit("done", 3);
        req.callback();
      }
    ]);
    const run = await runBatch(asConn(conn), "SELECT; UPDATE", { kind: "none" }, 30_000);
    expect(run.outcome).toEqual({ kind: "count", rowCount: 3 });
    expect(run.hiddenResultSets).toBe(1);
  });
});

describe("runScript", () => {
  test("stops later GO batches after the row cap and says so", async () => {
    const conn = createConnection([selectRows(MAX_ROWS + 1)]);
    const result = await runScript(asConn(conn), "SELECT 1\nGO\nUPDATE t SET a = 1");
    expect(conn.executed).toEqual(["SELECT 1"]);
    expect(result.messages).toContain(
      "Stopped after the first 1,000 rows. Statements after this query in the same batch may still have run. Later GO batches did not run."
    );
  });

  test("reports which batches ran when one fails", async () => {
    const failure = Object.assign(new Error("Invalid object name 'x'."), { number: 208 });
    const conn = createConnection([(req) => req.callback(), (req) => req.callback(failure)]);
    const error = await runScript(asConn(conn), "SELECT 1\nGO\nSELECT * FROM x\nGO\nSELECT 3").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MssqlScriptError);
    expect((error as MssqlScriptError).original).toBe(failure);
    expect((error as MssqlScriptError).batchContext).toBe(
      "Batch 2 of 3 failed. Batch 1 completed; batch 3 did not run."
    );
    expect(conn.executed).toHaveLength(2);
  });

  test("one time limit covers the whole script", async () => {
    const conn = createConnection([
      (req) => {
        setTimeout(() => req.callback(), 30);
      },
      (req) => {
        req.emit("columnMetadata", columns("n"));
      }
    ]);
    const error = await runScript(asConn(conn), "WAITFOR\nGO\nWAITFOR", 40).catch((e: unknown) => e);
    expect((error as MssqlScriptError).message).toBe(QUERY_TIMEOUT_MESSAGE);
    expect((error as MssqlScriptError).batchContext).toBe("Batch 2 of 2 was cancelled. Batch 1 completed.");
  });

  test("collects PRINT output and notes hidden result sets", async () => {
    const conn = createConnection([
      (req, c) => {
        c.emit("infoMessage", { message: "hello" });
        req.emit("columnMetadata", columns("a"));
        req.emit("done", 0);
        req.emit("columnMetadata", columns("b"));
        req.emit("done", 0);
        req.callback();
      }
    ]);
    const result = await runScript(asConn(conn), "PRINT 'hello'; SELECT 1 AS a; SELECT 2 AS b");
    expect(result.messages).toEqual([
      "hello",
      "1 other result set is not shown. The SQL editor shows one result set per run."
    ]);
    expect(conn.listenerCount("infoMessage")).toBe(0);
  });

  test("flags decimal columns whose values cannot be shown exactly", async () => {
    const conn = createConnection([
      (req) => {
        req.emit("columnMetadata", [
          { colName: "d", type: { name: "DecimalN" }, scale: 10 },
          { colName: "m", type: { name: "MoneyN" } }
        ]);
        req.emit("row", [{ value: 12345678901234567000 }, { value: 1.2345 }]);
        req.emit("done", 1);
        req.callback();
      }
    ]);
    const result = await runScript(asConn(conn), "SELECT d, m");
    expect(result.outcome).toMatchObject({ kind: "rows", rows: [{ m: "1.2345" }], lossyColumns: ["d"] });
    expect(result.messages[0]).toContain("Some values in d are too large to show exactly");
  });
});

describe("runScript server errors", () => {
  const serverError = (n: number) => ({ message: `boom ${n}`, number: 50000, class: 16, state: 1 });

  test("reports an earlier error when a batch stops at the row cap", async () => {
    const conn = createConnection([
      (req, c) => {
        c.emit("errorMessage", { message: "Divide by zero error encountered.", number: 8134, class: 16, state: 1 });
        selectRows(MAX_ROWS + 1)(req, c);
      }
    ]);
    const result = await runScript(asConn(conn), "SELECT 1/0; SELECT n FROM nums");
    expect(result.outcome.kind === "rows" && result.outcome.rows.length).toBe(MAX_ROWS);
    expect(result.messages[0]).toBe("Msg 8134, Level 16, State 1: Divide by zero error encountered.");
  });

  test("keeps the rows when tedious reports the earlier error instead of the cancel", async () => {
    const early = Object.assign(new Error("early error"), { number: 50000, class: 16, state: 1 });
    const conn = createConnection([
      (req, c) => {
        c.emit("errorMessage", { message: "early error", number: 50000, class: 16, state: 1 });
        req.emit("columnMetadata", columns("n"));
        for (let i = 0; i <= MAX_ROWS; i += 1) req.emit("row", [{ value: i }]);
      }
    ]);
    conn.cancel = () => {
      conn.cancelCount += 1;
      return true;
    };
    const pending = runScript(asConn(conn), "RAISERROR('early error', 16, 1); SELECT n FROM nums");
    await new Promise((resolve) => {
      setTimeout(resolve, 0);
    });
    conn.lastRequest?.callback(early);
    const result = await pending;
    expect(result.outcome.kind === "rows" && result.outcome.rows.length).toBe(MAX_ROWS);
    expect(result.messages[0]).toBe("Msg 50000, Level 16, State 1: early error");
  });

  test("cancels a flood of errors and keeps the first ones", async () => {
    const conn = createConnection([
      (req, c) => {
        for (let i = 0; i < 1000 && !c.isCancelled(); i += 1) c.emit("errorMessage", serverError(i));
      }
    ]);
    const error = await runScript(asConn(conn), "WHILE 1=1 RAISERROR('x', 16, 1)").catch((e: unknown) => e);
    expect(conn.cancelCount).toBe(1);
    expect(error).toBeInstanceOf(MssqlScriptError);
    expect((error as MssqlScriptError).batchContext).toBe("Stopped after 50 errors.");
    expect((error as MssqlScriptError).message).toBe("boom 0");
    expect((error as MssqlScriptError).original).toMatchObject({ number: 50000, class: 16, state: 1 });
    expect(conn.listenerCount("errorMessage")).toBe(0);
  });

  test("keeps PRINT output when the script fails", async () => {
    const failure = Object.assign(new Error("Violation of PRIMARY KEY constraint"), { number: 2627 });
    const conn = createConnection([
      (req, c) => {
        c.emit("infoMessage", { message: "starting" });
        c.emit("infoMessage", { message: "done" });
        req.callback(failure);
      }
    ]);
    const error = await runScript(asConn(conn), "PRINT 'starting'; INSERT t VALUES (1); PRINT 'done'").catch(
      (e: unknown) => e
    );
    expect((error as MssqlScriptError).messages).toEqual(["starting", "done"]);
  });
});

describe("runBatch procedures", () => {
  test("skips the rows of a procedure's later result sets instead of capping them", async () => {
    const conn = createConnection([
      (req) => {
        req.emit("columnMetadata", columns("first"));
        req.emit("row", [{ value: 1 }]);
        req.emit("doneInProc", 1);
        req.emit("columnMetadata", columns("second"));
        for (let i = 0; i < MAX_ROWS + 10; i += 1) req.emit("row", [{ value: i }]);
        req.emit("doneInProc", MAX_ROWS + 10);
        req.emit("doneProc");
        req.callback();
      }
    ]);
    const run = await runBatch(asConn(conn), "EXEC p", { kind: "none" }, 30_000);
    expect(conn.cancelCount).toBe(0);
    expect(run.stoppedAtLimit).toBeNull();
    expect(run.outcome).toMatchObject({ kind: "rows", fields: [{ name: "first" }], rows: [{ first: 1 }] });
    expect(run.hiddenResultSets).toBe(1);
  });
});

describe("runScript size limit", () => {
  test("names the byte limit and the rows actually kept", async () => {
    const big = "x".repeat(Math.ceil(DATA_EXPLORER_MAX_RESULT_BYTES / 4));
    const conn = createConnection([
      (req, c) => {
        req.emit("columnMetadata", [{ colName: "v", type: { name: "NVarChar" } }]);
        for (let i = 0; i < 10 && !c.isCancelled(); i += 1) req.emit("row", [{ value: big }]);
      }
    ]);
    const result = await runScript(asConn(conn), "SELECT v FROM t");
    expect(result.messages).toEqual([
      "Stopped after 3 rows because the result reached the 16 MB limit. Statements after this query in the same batch may still have run."
    ]);
  });
});

describe("describeBatchStop", () => {
  test("describes the batches around the one that stopped", () => {
    expect(describeBatchStop(0, 1, "failed")).toBeUndefined();
    expect(describeBatchStop(0, 3, "failed")).toBe("Batch 1 of 3 failed. Batches 2-3 did not run.");
    expect(describeBatchStop(3, 4, "was cancelled")).toBe("Batch 4 of 4 was cancelled. Batches 1-3 completed.");
  });
});
