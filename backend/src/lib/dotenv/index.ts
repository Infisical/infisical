import RE2 from "re2";

const DOTENV_KEY_RE = new RE2(/^[^\n\r=]+$/);

const escapeValue = (value: string): string => {
  if (/[\n\r"\\#=]/.test(value) || value !== value.trim()) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    return `"${escaped}"`;
  }
  return value;
};

const ESCAPE_SEQUENCE_RE = new RE2(/\\([\\"nr])/g);
const ESCAPE_SEQUENCES: Record<string, string> = { "\\": "\\", '"': '"', n: "\n", r: "\r" };

const unescapeValue = (raw: string): string => {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    // One pass, so the "n" after an escaped backslash ("\\n" in the file) is not also read as a newline
    return raw.slice(1, -1).replace(ESCAPE_SEQUENCE_RE, (_, ch: string) => ESCAPE_SEQUENCES[ch]);
  }
  return raw;
};

export const serializeEnvFile = (map: Record<string, string>): string => {
  return Object.entries(map)
    .map(([key, value]) => {
      if (!key || !DOTENV_KEY_RE.test(key)) {
        throw new Error(`Invalid environment variable name: ${key}`);
      }
      return `${key}=${escapeValue(value)}`;
    })
    .join("\n");
};

export const parseEnvFile = (content: string): Record<string, string> => {
  const result: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith("#")) {
      const eqIndex = line.indexOf("=");
      if (eqIndex !== -1) {
        const key = line.substring(0, eqIndex).trim();
        const value = unescapeValue(line.substring(eqIndex + 1));
        result[key] = value;
      }
    }
  }

  return result;
};
