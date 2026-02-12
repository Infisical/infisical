import { formatCommandResult, formatError, formatTable } from "./pam-web-access-sql-formatter";
import { splitStatements } from "./pam-web-access-sql-lexer";

/**
 * The REPL only depends on this interface, not on pg.Client directly.
 * pg.Client satisfies this interface out of the box.
 */
export type TQueryExecutor = {
  query(sql: string): Promise<{
    command: string;
    rowCount: number | null;
    fields: Array<{ name: string; dataTypeID: number }>;
    rows: Record<string, unknown>[];
  }>;
};

export type TPamSqlRepl = ReturnType<typeof createPamSqlRepl>;

const MAX_BUFFER_SIZE = 1024 * 1024; // 1 MB

export const createPamSqlRepl = (queryExecutor: TQueryExecutor) => {
  let buffer = "";

  const executeStatement = async (sql: string): Promise<string> => {
    try {
      const result = await queryExecutor.query(sql);

      if (result.fields?.length > 0) {
        return formatTable(result);
      }
      return formatCommandResult(result);
    } catch (err) {
      return formatError(err);
    }
  };

  const processInput = async (
    rawInput: string
  ): Promise<{
    output: string;
    prompt: string;
    shouldClose: boolean;
  }> => {
    // Check for quit commands when buffer is empty
    if (buffer.trim().length === 0) {
      const trimmed = rawInput.trim();
      if (trimmed === "\\q" || trimmed === "quit" || trimmed === "exit") {
        return { output: "Goodbye!\n", prompt: "", shouldClose: true };
      }
    }

    // Append input to buffer
    if (buffer.length > 0) {
      buffer += `\n${rawInput}`;
    } else {
      buffer = rawInput;
    }

    if (buffer.length > MAX_BUFFER_SIZE) {
      buffer = "";
      return {
        output: "ERROR: buffer size exceeded (1 MB limit). Buffer cleared.\n",
        prompt: "=> ",
        shouldClose: false
      };
    }

    // Split into complete and incomplete statements
    const { complete, remainder } = splitStatements(buffer);
    buffer = remainder;

    // Execute each complete statement
    let output = "";
    for (const stmt of complete) {
      const trimmed = stmt.trim();
      if (trimmed.length > 0) {
        // eslint-disable-next-line no-await-in-loop
        output += await executeStatement(trimmed);
      }
    }

    const prompt = buffer.trim().length > 0 ? "-> " : "=> ";
    return { output, prompt, shouldClose: false };
  };

  const clearBuffer = () => {
    buffer = "";
  };

  const getPrompt = () => (buffer.trim().length > 0 ? "-> " : "=> ");

  return { processInput, clearBuffer, getPrompt };
};
