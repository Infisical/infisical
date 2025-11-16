const LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.:-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

export const VALID_KEY_REGEX = /^[A-Za-z0-9._-]+$/;

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

          if (!VALID_KEY_REGEX.test(key)) {
            continue;
          }

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

/**
 * Parse a JSON secret object into a normalized key/value structure.
 *
 * - Only accepts keys that match ASCII-safe regex: /^[A-Za-z0-9._-]+$/
 * - Keys containing Unicode or invalid characters will be ignored
 * - Only string values are included in the output
 *
 * @param {ArrayBuffer | string} src - Raw JSON content as a string or ArrayBuffer
 * @returns {Record<string, { value: string; comments: string[] }>} 
 *          A normalized map of secret keys and their string values
 */
export const parseJson = (src: ArrayBuffer | string): Record<string, { value: string; comments: string[] }> => {
  const file = src.toString();
  const formatedData: Record<string, string> = JSON.parse(file);
  const env: Record<string, { value: string; comments: string[] }> = {};
  Object.keys(formatedData).forEach((key) => {
    if (!VALID_KEY_REGEX.test(key)) {
      return;
    }
    if (typeof formatedData[key] === "string") {
      env[key] = { value: formatedData[key], comments: [] };
    }
  });
  return env;
};

/**
 * Parses simple flat YAML with support for multiline strings using |, |-, and >.
 * @param {ArrayBuffer | string} src
 * @returns {Record<string, { value: string, comments: string[] }>}
 */
export function parseYaml(src: ArrayBuffer | string) {
  const result: Record<string, { value: string; comments: string[] }> = {};

  const content = src.toString().replace(/\r\n?/g, "\n");
  const lines = content.split("\n");

  let i = 0;
  let comments: string[] = [];

  while (i < lines.length) {
    const line = lines[i].trim();

    // Collect comment
    if (line.startsWith("#")) {
      comments.push(line.slice(1).trim());
      i += 1; // move to next line
    } else {
      // Match key: value or key: |, key: >, etc.
      const keyMatch = lines[i].match(/^([\w.-]+)\s*:\s*(.*)$/);
      if (keyMatch) {
        const [, key, rawValue] = keyMatch;

        if (!VALID_KEY_REGEX.test(key)) {
          i += 1;
          continue;
        }

        let value = rawValue.trim();

        // Multiline string handling
        if (value === "|-" || value === "|" || value === ">") {
          const isFolded = value === ">";

          const baseIndent = lines[i + 1]?.match(/^(\s*)/)?.[1]?.length ?? 0;
          const collectedLines: string[] = [];

          i += 1; // move to first content line

          while (i < lines.length) {
            const current = lines[i];
            const currentIndent = current.match(/^(\s*)/)?.[1]?.length ?? 0;

            if (current.trim() === "" || currentIndent >= baseIndent) {
              collectedLines.push(current.slice(baseIndent));
              i += 1; // move to next line
            } else {
              break;
            }
          }

          if (isFolded) {
            // Join lines with space for `>` folded style
            value = collectedLines.map((l) => l.trim()).join(" ");
          } else {
            // Keep lines with newlines for `|` and `|-`
            value = collectedLines.join("\n");
          }
        } else {
          // Inline value — strip quotes and inline comment
          const commentIndex = value.indexOf(" #");
          if (commentIndex !== -1) {
            value = value.slice(0, commentIndex).trim();
          }

          // Remove surrounding quotes
          if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
          ) {
            value = value.slice(1, -1);
          }

          i += 1; // advance to next line
        }

        result[key] = {
          value,
          comments: [...comments]
        };
        comments = []; // reset
      } else {
        i += 1; // skip unknown line
      }
    }
  }

  return result;
}

function detectSeparator(csvContent: string): string {
  const firstLine = csvContent.split("\n")[0];
  const separators = [",", ";", "\t", "|"];

  const counts = separators.map((sep) => ({
    separator: sep,
    count: (firstLine.match(new RegExp(`\\${sep}`, "g")) || []).length
  }));

  const detected = counts.reduce((max, curr) => (curr.count > max.count ? curr : max));

  return detected.count > 0 ? detected.separator : ",";
}

export function parseCsvToMatrix(src: ArrayBuffer | string): string[][] {
  let csvContent: string;
  if (typeof src === "string") {
    csvContent = src;
  } else {
    csvContent = new TextDecoder("utf-8").decode(src);
  }

  const separator = detectSeparator(csvContent);
  const lines = csvContent.replace(/\r\n?/g, "\n").split("\n");
  const matrix: string[][] = [];

  lines.forEach((line) => {
    if (line.trim() !== "") {
      const cells: string[] = [];
      let currentCell = "";
      let inQuote = false;

      for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        const nextChar = line[i + 1];

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
        } else {
          currentCell += char;
        }
      }
      cells.push(currentCell.trim());
      matrix.push(cells);
    }
  });

  return matrix;
}
