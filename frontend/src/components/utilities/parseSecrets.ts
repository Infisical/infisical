const LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.:-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

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

export const parseJson = (src: ArrayBuffer | string) => {
  const file = src.toString();
  const formatedData: Record<string, string> = JSON.parse(file);
  const env: Record<string, { value: string; comments: string[] }> = {};
  Object.keys(formatedData).forEach((key) => {
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
