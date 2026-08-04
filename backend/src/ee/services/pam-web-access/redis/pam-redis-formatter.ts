import RE2 from "re2";

const escapeBackslash = new RE2(/\\/, "g");
const escapeQuote = new RE2(/"/, "g");

// CRLF is only a line ending, so normalize it and let the newline through
const crlf = new RE2(/\r\n/, "g");

// every control byte except tab and newline. A reply reaches an xterm session that
// would otherwise act on it: ESC starts an escape sequence, and a lone CR returns to
// column zero, letting a reply overwrite the line above it. Tab and newline are safe
// and keep multi-line replies such as INFO readable.
// eslint-disable-next-line no-control-regex
const controlBytes = new RE2(/[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/, "g");

// redis-cli uses the short forms for the common ones and hex for the rest
const SHORT_ESCAPES: Record<string, string> = {
  "\n": "\\n",
  "\r": "\\r",
  "\t": "\\t",
  "\b": "\\b",
  "\f": "\\f"
};

const toEscape = (ch: string): string => SHORT_ESCAPES[ch] ?? `\\x${ch.charCodeAt(0).toString(16).padStart(2, "0")}`;

export const escapeTerminalControlBytes = (str: string): string =>
  str.replace(crlf, "\n").replace(controlBytes, toEscape);

// the reverse of SHORT_ESCAPES, for parsing what the user types
const INPUT_ESCAPES: Record<string, string> = {
  n: "\n",
  r: "\r",
  t: "\t",
  b: "\b",
  f: "\f",
  a: "\u0007"
};

const HEX_PAIR = new RE2(/^[0-9a-fA-F]{2}$/);

const escapeRedisString = (str: string): string =>
  escapeTerminalControlBytes(str.replace(escapeBackslash, "\\\\").replace(escapeQuote, '\\"'));

export const tokenizeRedisInput = (input: string): string[] => {
  const tokens: string[] = [];
  let current = "";
  let inQuote: "'" | '"' | null = null;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inQuote) {
      // matching redis-cli: inside double quotes \n and friends become the byte they
      // name and \xHH becomes that byte, while single quotes only escape the quote
      if (escaped) {
        if (inQuote === "'") {
          current += ch === "'" ? ch : `\\${ch}`;
        } else if (ch === "x" && HEX_PAIR.test(input.slice(i + 1, i + 3))) {
          current += String.fromCharCode(parseInt(input.slice(i + 1, i + 3), 16));
          i += 2;
        } else {
          current += INPUT_ESCAPES[ch] ?? ch;
        }
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === inQuote) {
        tokens.push(current);
        current = "";
        inQuote = null;
      } else {
        current += ch;
      }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === " " || ch === "\t") {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
    } else {
      current += ch;
    }
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
};

export const formatRedisReply = (reply: unknown, indent: number = 0): string => {
  const prefix = " ".repeat(indent);

  if (reply === null || reply === undefined) {
    return `${prefix}(nil)`;
  }

  if (typeof reply === "number" || typeof reply === "bigint") {
    return `${prefix}(integer) ${reply}`;
  }

  if (typeof reply === "string") {
    return `${prefix}"${escapeRedisString(reply)}"`;
  }

  if (Buffer.isBuffer(reply)) {
    return `${prefix}"${escapeRedisString(reply.toString())}"`;
  }

  if (Array.isArray(reply)) {
    if (reply.length === 0) {
      return `${prefix}(empty array)`;
    }
    return reply.map((item, i) => `${prefix}${i + 1}) ${formatRedisReply(item, indent + 3).trimStart()}`).join("\n");
  }

  return `${prefix}"${String(reply)}"`;
};
