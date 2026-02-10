type TSplitResult = {
  complete: string[];
  remainder: string;
};

enum LexerState {
  Normal = "normal",
  SingleQuote = "single_quote",
  DollarQuote = "dollar_quote",
  LineComment = "line_comment",
  BlockComment = "block_comment"
}

/**
 * Tries to parse a dollar-quote tag starting at position i.
 * Returns the full tag (e.g. "$$" or "$fn$") if found, null otherwise.
 */
const tryParseDollarTag = (sql: string, i: number): string | null => {
  // Must start with $
  if (sql[i] !== "$") return null;

  // Check for $$ (empty tag)
  if (i + 1 < sql.length && sql[i + 1] === "$") {
    return "$$";
  }

  // Check for $identifier$ pattern
  // Identifier must start with [A-Za-z_\x80-\xff]
  const startChar = i + 1 < sql.length ? sql.charCodeAt(i + 1) : 0;
  const isValidStart =
    (startChar >= 65 && startChar <= 90) || // A-Z
    (startChar >= 97 && startChar <= 122) || // a-z
    startChar === 95 || // _
    startChar >= 128; // \x80-\xff

  if (!isValidStart) return null;

  // Scan for the rest of the identifier + closing $
  let j = i + 2;
  while (j < sql.length) {
    const code = sql.charCodeAt(j);
    const isValidContinue =
      (code >= 65 && code <= 90) || // A-Z
      (code >= 97 && code <= 122) || // a-z
      (code >= 48 && code <= 57) || // 0-9
      code === 95 || // _
      code >= 128; // \x80-\xff

    if (code === 36) {
      // Found closing $
      return sql.substring(i, j + 1);
    }
    if (!isValidContinue) {
      return null;
    }
    j += 1;
  }

  return null;
};

/**
 * Splits a SQL string into individual statements by detecting semicolons
 * that are actual statement boundaries (not inside strings, comments, etc.).
 *
 * Returns complete statements (terminated by ;) and any remaining text.
 */
export const splitStatements = (sql: string): TSplitResult => {
  const complete: string[] = [];
  let buffer = "";
  let state = LexerState.Normal;
  let dollarTag = "";
  let blockDepth = 0;
  let i = 0;

  while (i < sql.length) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : "";

    switch (state) {
      case LexerState.Normal:
        if (ch === ";") {
          complete.push(buffer);
          buffer = "";
        } else if (ch === "'") {
          buffer += ch;
          state = LexerState.SingleQuote;
        } else if (ch === "$") {
          // Check for dollar-quote tag: $$ or $identifier$
          const tag = tryParseDollarTag(sql, i);
          if (tag !== null) {
            buffer += tag;
            dollarTag = tag;
            state = LexerState.DollarQuote;
            i += tag.length - 1; // -1 because the loop will i++
          } else {
            buffer += ch;
          }
        } else if (ch === "-" && next === "-") {
          buffer += "--";
          state = LexerState.LineComment;
          i += 1;
        } else if (ch === "/" && next === "*") {
          buffer += "/*";
          state = LexerState.BlockComment;
          blockDepth = 1;
          i += 1;
        } else {
          buffer += ch;
        }
        break;

      case LexerState.SingleQuote:
        if (ch === "'" && next === "'") {
          // Escaped single quote
          buffer += "''";
          i += 1;
        } else if (ch === "'") {
          buffer += ch;
          state = LexerState.Normal;
        } else {
          buffer += ch;
        }
        break;

      case LexerState.DollarQuote:
        // Check if we've hit the closing dollar tag
        if (ch === "$" && sql.substring(i, i + dollarTag.length) === dollarTag) {
          buffer += dollarTag;
          i += dollarTag.length - 1;
          state = LexerState.Normal;
        } else {
          buffer += ch;
        }
        break;

      case LexerState.LineComment:
        buffer += ch;
        if (ch === "\n") {
          state = LexerState.Normal;
        }
        break;

      case LexerState.BlockComment:
        if (ch === "/" && next === "*") {
          buffer += "/*";
          blockDepth += 1;
          i += 1;
        } else if (ch === "*" && next === "/") {
          buffer += "*/";
          blockDepth -= 1;
          if (blockDepth === 0) {
            state = LexerState.Normal;
          }
          i += 1;
        } else {
          buffer += ch;
        }
        break;

      default:
        buffer += ch;
    }

    i += 1;
  }

  return { complete, remainder: buffer };
};
