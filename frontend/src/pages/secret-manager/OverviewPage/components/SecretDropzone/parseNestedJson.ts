import { TParsedEnv } from "./types";

// Same rule the create folder form enforces
const FOLDER_NAME_REGEX = /^[a-zA-Z0-9-_]+$/;
const MAX_FOLDER_NAME_LENGTH = 255;

export type TNestedJsonImport = {
  // Paths are relative to the import path and ordered parent-before-child
  folderPaths: string[];
  secretsByPath: Record<string, TParsedEnv>;
  errors: string[];
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const joinSecretPath = (basePath: string, relativePath: string) => {
  if (relativePath === "/") return basePath;
  return basePath === "/" ? relativePath : `${basePath}${relativePath}`;
};

export const getNestedJsonObject = (src?: string) => {
  if (!src) return null;
  try {
    const data: unknown = JSON.parse(src);
    if (isPlainObject(data) && Object.values(data).some(isPlainObject)) return data;
  } catch {
    // not JSON, so nested import does not apply
  }
  return null;
};

const toSecretValue = (value: unknown) => {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value)) return JSON.stringify(value);
  return String(value);
};

export const flattenNestedJson = (data: Record<string, unknown>): TNestedJsonImport => {
  // Null-prototype maps so user keys such as "__proto__" stay ordinary entries
  const result: TNestedJsonImport = {
    folderPaths: [],
    secretsByPath: Object.create(null),
    errors: []
  };

  const walk = (node: Record<string, unknown>, path: string) => {
    Object.entries(node).forEach(([key, value]) => {
      if (isPlainObject(value)) {
        const folderPath = joinSecretPath(path, `/${key}`);
        if (!FOLDER_NAME_REGEX.test(key) || key.length > MAX_FOLDER_NAME_LENGTH) {
          result.errors.push(
            `"${folderPath}": folder names can only contain letters, numbers, dashes, and underscores (max ${MAX_FOLDER_NAME_LENGTH} characters).`
          );
          return;
        }
        result.folderPaths.push(folderPath);
        walk(value, folderPath);
        return;
      }

      // Mirrors the backend secret name rule, so no folder is written before a bad key fails
      if (!key.trim() || key.includes(":") || key.includes("/")) {
        result.errors.push(
          `"${joinSecretPath(path, `/${key}`)}": secret keys cannot be empty or contain a colon or forward slash.`
        );
        return;
      }

      result.secretsByPath[path] ??= Object.create(null);
      result.secretsByPath[path][key] = { value: toSecretValue(value), comments: [] };
    });
  };

  walk(data, "/");
  return result;
};
