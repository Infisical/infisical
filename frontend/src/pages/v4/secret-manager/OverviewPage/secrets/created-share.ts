import type { Secret } from "../secrets-model";

const MAX_SHARED_SECRET_LENGTH = 10_000;

const toEnvLine = (key: string, value: string) =>
  /[\n"'#]|^\s|\s$/.test(value)
    ? `${key}="${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`
    : `${key}=${value}`;

const toSavedValue = (value: string) =>
  value.at(-1) === "\n" ? `${value.trim()}\n` : value.trim();

export const createdSecretsShare = (
  secrets: readonly Secret[],
  canReadValue: (secret: Secret) => boolean
) => {
  const shareable = new Map<string, string>();
  secrets.forEach((secret) => {
    const saved = toSavedValue(secret.value.status === "present" ? secret.value.value : "");
    if (!saved || shareable.has(secret.name) || !canReadValue(secret)) return;
    shareable.set(secret.name, saved);
  });
  const entries = [...shareable.entries()];
  if (!entries.length) return undefined;
  const value =
    entries.length === 1
      ? entries[0][1]
      : entries.map(([key, entry]) => toEnvLine(key, entry)).join("\n");
  if (value.length > MAX_SHARED_SECRET_LENGTH) return undefined;
  return { count: entries.length, value };
};
