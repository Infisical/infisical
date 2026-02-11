import { beforeEach, describe, expect, it, vi } from "vitest";

import { createPamSqlRepl, TQueryExecutor } from "./pam-web-access-repl";

describe("createPamSqlRepl", () => {
  let queryFn: ReturnType<typeof vi.fn>;
  let mockExecutor: TQueryExecutor;
  let repl: ReturnType<typeof createPamSqlRepl>;

  beforeEach(() => {
    queryFn = vi.fn().mockResolvedValue({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "?column?", dataTypeID: 23 }],
      rows: [{ "?column?": 1 }]
    });
    mockExecutor = { query: queryFn };
    repl = createPamSqlRepl(mockExecutor);
  });

  // Statement execution
  it("executes complete statement", async () => {
    const result = await repl.processInput("SELECT 1;");
    expect(queryFn).toHaveBeenCalledWith("SELECT 1");
    expect(result.output).toContain("1");
    expect(result.prompt).toBe("=> ");
    expect(result.shouldClose).toBe(false);
  });

  it("buffers incomplete input", async () => {
    const result = await repl.processInput("SELECT *");
    expect(queryFn).not.toHaveBeenCalled();
    expect(result.output).toBe("");
    expect(result.prompt).toBe("-> ");
    expect(result.shouldClose).toBe(false);
  });

  it("executes after completing buffered statement", async () => {
    await repl.processInput("SELECT *");
    expect(queryFn).not.toHaveBeenCalled();

    const result = await repl.processInput("FROM users;");
    expect(queryFn).toHaveBeenCalledWith("SELECT *\nFROM users");
    expect(result.prompt).toBe("=> ");
  });

  it("executes multiple statements sequentially", async () => {
    queryFn
      .mockResolvedValueOnce({
        command: "SELECT",
        rowCount: 1,
        fields: [{ name: "?column?", dataTypeID: 23 }],
        rows: [{ "?column?": 1 }]
      })
      .mockResolvedValueOnce({
        command: "SELECT",
        rowCount: 1,
        fields: [{ name: "?column?", dataTypeID: 23 }],
        rows: [{ "?column?": 2 }]
      });

    const result = await repl.processInput("SELECT 1; SELECT 2;");
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(queryFn).toHaveBeenCalledWith("SELECT 1");
    expect(queryFn).toHaveBeenCalledWith("SELECT 2");
    expect(result.prompt).toBe("=> ");
  });

  // Quit
  it("returns shouldClose for \\q", async () => {
    const result = await repl.processInput("\\q");
    expect(result.shouldClose).toBe(true);
    expect(result.output).toBe("Goodbye!\n");
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("returns shouldClose for quit", async () => {
    const result = await repl.processInput("quit");
    expect(result.shouldClose).toBe(true);
  });

  it("returns shouldClose for exit", async () => {
    const result = await repl.processInput("exit");
    expect(result.shouldClose).toBe(true);
  });

  it("treats quit as SQL when buffer non-empty", async () => {
    await repl.processInput("SELECT");
    const result = await repl.processInput("quit;");
    expect(result.shouldClose).toBe(false);
    expect(queryFn).toHaveBeenCalledWith("SELECT\nquit");
  });

  // Buffer management
  it("clearBuffer resets to empty", async () => {
    await repl.processInput("SELECT *");
    expect(repl.getPrompt()).toBe("-> ");

    repl.clearBuffer();
    expect(repl.getPrompt()).toBe("=> ");
  });

  it("getPrompt returns => when buffer empty", () => {
    expect(repl.getPrompt()).toBe("=> ");
  });

  it("getPrompt returns -> when buffer has content", async () => {
    await repl.processInput("SELECT *");
    expect(repl.getPrompt()).toBe("-> ");
  });

  // Error handling
  it("catches query error and returns formatted error", async () => {
    queryFn.mockRejectedValueOnce({
      message: 'relation "nonexistent" does not exist'
    });

    const result = await repl.processInput("SELECT * FROM nonexistent;");
    expect(result.output).toContain("ERROR:");
    expect(result.output).toContain("nonexistent");
    expect(result.shouldClose).toBe(false);
    expect(result.prompt).toBe("=> ");
  });

  it("continues working after error", async () => {
    queryFn.mockRejectedValueOnce({ message: "error" }).mockResolvedValueOnce({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "?column?", dataTypeID: 23 }],
      rows: [{ "?column?": 1 }]
    });

    await repl.processInput("BAD SQL;");
    const result = await repl.processInput("SELECT 1;");
    expect(result.output).toContain("1");
    expect(result.prompt).toBe("=> ");
  });

  // Empty input
  it("re-prompts on empty input with empty buffer", async () => {
    const result = await repl.processInput("");
    expect(queryFn).not.toHaveBeenCalled();
    expect(result.prompt).toBe("=> ");
  });

  it("skips empty statements (bare ;)", async () => {
    const result = await repl.processInput(";");
    expect(queryFn).not.toHaveBeenCalled();
    expect(result.prompt).toBe("=> ");
  });

  it("handles mixed complete + incomplete on one input", async () => {
    queryFn.mockResolvedValueOnce({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "?column?", dataTypeID: 23 }],
      rows: [{ "?column?": 1 }]
    });

    const result = await repl.processInput("SELECT 1; SELECT");
    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(queryFn).toHaveBeenCalledWith("SELECT 1");
    expect(result.prompt).toBe("-> ");

    // Complete the second statement
    queryFn.mockResolvedValueOnce({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "?column?", dataTypeID: 23 }],
      rows: [{ "?column?": 2 }]
    });

    const result2 = await repl.processInput("2;");
    expect(queryFn).toHaveBeenCalledTimes(2);
    expect(result2.prompt).toBe("=> ");
  });

  it("DML result formatting", async () => {
    queryFn.mockResolvedValueOnce({
      command: "INSERT",
      rowCount: 1,
      fields: [],
      rows: []
    });

    const result = await repl.processInput("INSERT INTO t VALUES(1);");
    expect(result.output).toBe("INSERT 0 1\n");
  });

  it("returns error and clears buffer when input exceeds 1 MB limit", async () => {
    const oversized = "A".repeat(1024 * 1024 + 1);
    const result = await repl.processInput(oversized);
    expect(result.output).toContain("buffer size exceeded");
    expect(result.prompt).toBe("=> ");
    expect(result.shouldClose).toBe(false);
    expect(queryFn).not.toHaveBeenCalled();

    // REPL should still work after buffer was cleared
    queryFn.mockResolvedValueOnce({
      command: "SELECT",
      rowCount: 1,
      fields: [{ name: "?column?", dataTypeID: 23 }],
      rows: [{ "?column?": 1 }]
    });
    const next = await repl.processInput("SELECT 1;");
    expect(next.output).toContain("1");
    expect(next.prompt).toBe("=> ");
  });

  it("multi-statement paste", async () => {
    queryFn
      .mockResolvedValueOnce({
        command: "CREATE TABLE",
        rowCount: null,
        fields: [],
        rows: []
      })
      .mockResolvedValueOnce({
        command: "INSERT",
        rowCount: 1,
        fields: [],
        rows: []
      })
      .mockResolvedValueOnce({
        command: "SELECT",
        rowCount: 1,
        fields: [{ name: "id", dataTypeID: 23 }],
        rows: [{ id: 1 }]
      });

    const result = await repl.processInput("CREATE TABLE t(id int); INSERT INTO t VALUES(1); SELECT * FROM t;");
    expect(queryFn).toHaveBeenCalledTimes(3);
    expect(result.output).toContain("CREATE TABLE");
    expect(result.output).toContain("INSERT 0 1");
    expect(result.output).toContain("(1 row)");
    expect(result.prompt).toBe("=> ");
  });
});
