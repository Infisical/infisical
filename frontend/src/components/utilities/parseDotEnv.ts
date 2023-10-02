const LINE =
  /(?:^|^)\s*(?:export\s+)?([\w.:-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/gm;

/**
 * Return text that is the buffer parsed
 * @param {ArrayBuffer} src - source buffer
 * @returns {String} text - text of buffer
 */
export function parseDotEnv(src: ArrayBuffer) {
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
