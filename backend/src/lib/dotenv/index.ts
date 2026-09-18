import RE2 from "re2";

const DOTENV_KEY_RE = new RE2(/^[^\n\r=]+$/);

const escapeValue = (value: string): string => {
  if (/[\n\r"\\#=]/.test(value) || value !== value.trim()) {
    const escaped = value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n").replace(/\r/g, "\\r");
    return `"${escaped}"`;
  }
  return value;
};

const unescapeValue = (raw: string): string => {
  if (raw.startsWith('"') && raw.endsWith('"') && raw.length >= 2) {
    return raw.slice(1, -1).replace(/\\r/g, "\r").replace(/\\n/g, "\n").replace(/\\"/g, '"').replace(/\\\\/g, "\\");
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
