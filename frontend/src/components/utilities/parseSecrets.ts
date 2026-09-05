import { isMap, isNode, isScalar, isSeq, parseDocument } from "yaml";

const LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.:-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

const decodeSource = (src: ArrayBuffer | string) =>
  typeof src === "string" ? src : new TextDecoder("utf-8").decode(src);

/**
 * Return text that is the buffer parsed
 * @param {ArrayBuffer} src - source buffer
 * @returns {String} text - text of buffer
 */
export function parseDotEnv(src: ArrayBuffer | string) {
  const object: {
    [key: string]: { value: string; comments: string[] };
  } = {};

  // Convert buffer to string
  let lines = src.toString();

  // Convert line breaks to same format
  lines = lines.replace(/\r\n?/gm, "\n");

  let comments: string[] = [];

  lines
    .split("\n")
    .map((line) => {
      // collect comments of each env variable
      if (line.startsWith("#")) {
        comments.push(line.replace("#", "").trim());
      } else if (line) {
        let match;
        let item: [string, string, string[]] | [] = [];

        // eslint-disable-next-line no-cond-assign
        while ((match = LINE.exec(line)) !== null) {
          const key = match[1];

          // Default undefined or null to empty string
          let value = match[2] || "";

          // Remove whitespace
          value = value.trim();

          // Check if double quoted
          const maybeQuote = value[0];

          // Remove surrounding quotes
          value = value.replace(/^(['"`])([\s\S]*)\1$/gm, "$2");

          // Expand newlines if double quoted
          if (maybeQuote === '"') {
            value = value.replace(/\\n/g, "\n");
            value = value.replace(/\\r/g, "\r");
          }
          item = [key, value, comments];
        }
        comments = [];
        return item;
      }
      return [];
    })
    .filter((line) => line.length > 1)
    .forEach((line) => {
      const [key, value, cmnts] = line;
      object[key as string] = { value, comments: cmnts };
    });

  return object;
}

// PEM padding can resemble KEY=VALUE lines, but the entire block is one secret value.
export const parsePastedEnv = (content: string) =>
  content.includes("-----BEGIN") ? {} : parseDotEnv(content);

export const parseJson = (src: ArrayBuffer | string) => {
  const file = src.toString();
  const formatedData = JSON.parse(file);
  const env: Record<string, { value: string; comments: string[] }> = {};
  if (formatedData === null || typeof formatedData !== "object" || Array.isArray(formatedData)) {
    return env;
  }
  const data = formatedData as Record<string, unknown>;
  Object.keys(data).forEach((key) => {
    const val = data[key];
    if (val === null || val === undefined) {
      return;
    }
    if (typeof val === "object") {
      env[key] = { value: JSON.stringify(val), comments: [] };
    } else {
      env[key] = { value: String(val), comments: [] };
    }
  });
  return env;
};

/**
 * Parses a flat YAML document into secrets. Block scalars, folding, chomping,
 * quoting and comments are all handled by the parser, so multiline values keep
 * their line breaks. Nested maps and sequences are stringified, matching parseJson.
 * Throws on invalid YAML so callers can fall back to another format or report it.
 * @param {ArrayBuffer | string} src
 * @returns {Record<string, { value: string, comments: string[] }>}
 */
export function parseYaml(src: ArrayBuffer | string) {
  const result: Record<string, { value: string; comments: string[] }> = {};

  const doc = parseDocument(decodeSource(src));
  if (doc.errors.length) {
    throw new Error(doc.errors[0].message);
  }

  const root = doc.contents;
  if (!isMap(root)) {
    return result;
  }

  root.items.forEach((pair) => {
    const keyNode = pair.key;
    if (!isScalar(keyNode)) {
      return;
    }

    const key = String(keyNode.value ?? "").trim();
    if (!key) {
      return;
    }

    const valueNode = pair.value;
    let value = "";
    if (isMap(valueNode) || isSeq(valueNode)) {
      value = JSON.stringify(valueNode.toJSON());
    } else if (isScalar(valueNode) && valueNode.value !== null && valueNode.value !== undefined) {
      value = String(valueNode.value);
    }

    const comments = [keyNode.commentBefore, isNode(valueNode) ? valueNode.comment : null]
      .filter((comment): comment is string => Boolean(comment))
      .flatMap((comment) => comment.split("\n"))
      .map((comment) => comment.trim())
      .filter(Boolean);

    result[key] = { value, comments };
  });

  return result;
}

export type CsvDelimiter = "," | ";" | "\t" | "|";

const CSV_DELIMITERS: readonly CsvDelimiter[] = [",", ";", "\t", "|"];

function detectSeparator(csvContent: string): CsvDelimiter {
  const firstLine = csvContent.split("\n")[0];

  const counts = CSV_DELIMITERS.map((sep) => ({
    separator: sep,
    count: (firstLine.match(new RegExp(`\\${sep}`, "g")) || []).length
  }));

  const detected = counts.reduce((max, curr) => (curr.count > max.count ? curr : max));

  return detected.count > 0 ? detected.separator : ",";
}

export function parseCsvToMatrix(src: ArrayBuffer | string): {
  matrix: string[][];
  delimiter: CsvDelimiter;
} {
  const csvContent = decodeSource(src);

  const separator = detectSeparator(csvContent);
  const normalized = csvContent.replace(/\r\n?/g, "\n");
  const matrix: string[][] = [];

  let cells: string[] = [];
  let currentCell = "";
  let inQuote = false;

  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const nextChar = normalized[i + 1];

    if (char === '"') {
      if (inQuote && nextChar === '"') {
        currentCell += '"';
        i += 1;
      } else {
        inQuote = !inQuote;
      }
    } else if (char === separator && !inQuote) {
      cells.push(currentCell.trim());
      currentCell = "";
    } else if (char === "\n" && !inQuote) {
      cells.push(currentCell.trim());
      if (cells.some((c) => c !== "")) {
        matrix.push(cells);
      }
      cells = [];
      currentCell = "";
    } else {
      currentCell += char;
    }
  }

  if (currentCell.length > 0 || cells.length > 0) {
    cells.push(currentCell.trim());
    if (cells.some((c) => c !== "")) {
      matrix.push(cells);
    }
  }

  return { matrix, delimiter: separator };
}

export type TParsedSecrets = Record<string, { value: string; comments: string[] }>;

// A "key: |" / "key: >" header is the one construct .env cannot express, so it is
// checked before the .env assignment test: an assignment can legitimately appear
// inside a block scalar's body, which is why that test rejects indented lines.
const YAML_BLOCK_SCALAR = /^[^\s#][^\n]*:[ \t]*[|>][-+]?\d*[ \t]*(?:#.*)?$/m;
const DOTENV_ASSIGNMENT = /^(?:export\s+)?[\w.:-]+\s*=/m;

const parseOrNull = (parse: () => TParsedSecrets) => {
  try {
    const parsed = parse();
    return Object.keys(parsed).length ? parsed : null;
  } catch {
    return null;
  }
};

/**
 * Detects the format of pasted secrets (.json, .yml or .env) and parses it.
 */
export const parsePastedSecrets = (value: string): TParsedSecrets => {
  const json = parseOrNull(() => parseJson(value));
  if (json) {
    return json;
  }

  if (YAML_BLOCK_SCALAR.test(value)) {
    const yaml = parseOrNull(() => parseYaml(value));
    if (yaml) {
      return yaml;
    }
  }

  if (DOTENV_ASSIGNMENT.test(value)) {
    return parseDotEnv(value);
  }

  return parseOrNull(() => parseYaml(value)) ?? parseDotEnv(value);
};
