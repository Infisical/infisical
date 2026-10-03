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

      // Trimmed and validated like the backend secret name rule, so no folder is written
      // before a bad or duplicate key fails
      const secretKey = key.trim();
      const secretPath = joinSecretPath(path, `/${secretKey}`);
      if (!secretKey || secretKey.includes(":") || secretKey.includes("/")) {
        result.errors.push(
          `"${secretPath}": secret keys cannot be empty or contain a colon or forward slash.`
        );
        return;
      }

      result.secretsByPath[path] ??= Object.create(null);
      if (secretKey in result.secretsByPath[path]) {
        result.errors.push(
          `"${secretPath}": more than one key becomes "${secretKey}" once surrounding spaces are removed.`
        );
        return;
      }
      result.secretsByPath[path][secretKey] = { value: toSecretValue(value), comments: [] };
    });
  };

  walk(data, "/");
  return result;
};

export type TFolderNode = {
  name: string;
  path: string;
  secrets: TParsedEnv;
  children: TFolderNode[];
  // Includes secrets in descendant folders
  secretCount: number;
};

export const buildFolderTree = ({ folderPaths, secretsByPath }: TNestedJsonImport): TFolderNode => {
  const childPaths = new Map<string, string[]>();
  folderPaths.forEach((path) => {
    const parentPath = path.slice(0, path.lastIndexOf("/")) || "/";
    childPaths.set(parentPath, [...(childPaths.get(parentPath) ?? []), path]);
  });

  const buildNode = (path: string): TFolderNode => {
    const secrets = secretsByPath[path] ?? {};
    const children = (childPaths.get(path) ?? []).map(buildNode);
    return {
      name: path.slice(path.lastIndexOf("/") + 1),
      path,
      secrets,
      children,
      secretCount:
        Object.keys(secrets).length + children.reduce((sum, child) => sum + child.secretCount, 0)
    };
  };

  return buildNode("/");
};

// "created" and "found" are folders that are ready to hold secrets; a found folder changes
// nothing, so it is neutral in the result. "skipped" is a folder that could not be used,
// or sits under one that could not.
type TPathOutcome = {
  status: "written" | "created" | "found" | "skipped" | "failed";
  reason?: string;
  hasApproval?: boolean;
};

type TNestedImportHandlers = {
  // Resolves false when the folder is missing and cannot be created
  resolveFolder: (path: string) => Promise<"created" | "found" | false>;
  writeSecrets: (
    path: string,
    secrets: TParsedEnv
  ) => Promise<{ isWritten: boolean; hasApproval: boolean }>;
};

const getParentPath = (path: string) => path.slice(0, path.lastIndexOf("/")) || "/";

export const runNestedImport = async (
  { folderPaths, secretsByPath }: TNestedJsonImport,
  { resolveFolder, writeSecrets }: TNestedImportHandlers
) => {
  const outcomes = new Map<string, TPathOutcome>();
  const isFolderReady = (path: string) =>
    path === "/" || ["created", "found"].includes(outcomes.get(path)?.status ?? "");

  // One at a time so parents always exist before their children
  // eslint-disable-next-line no-restricted-syntax
  for (const path of folderPaths) {
    if (!isFolderReady(getParentPath(path))) {
      outcomes.set(path, { status: "skipped" });
    } else {
      try {
        // eslint-disable-next-line no-await-in-loop
        const folderState = await resolveFolder(path);
        outcomes.set(
          path,
          folderState
            ? { status: folderState }
            : { status: "skipped", reason: "no permission to create this folder" }
        );
      } catch {
        outcomes.set(path, { status: "failed", reason: "folder could not be created" });
      }
    }
  }

  const writablePaths = Object.entries(secretsByPath).filter(([path]) => isFolderReady(path));
  await Promise.all(
    writablePaths.map(async ([path, secrets]) => {
      try {
        const { isWritten, hasApproval } = await writeSecrets(path, secrets);
        outcomes.set(
          path,
          isWritten
            ? { status: "written", hasApproval }
            : { status: "failed", reason: "secrets could not be saved", hasApproval }
        );
      } catch {
        outcomes.set(path, { status: "failed", reason: "secrets could not be saved" });
      }
    })
  );

  // The result counts what the user asked to write: every path with secrets, plus folders
  // that are empty in the JSON. Folders that only hold subfolders are left out, otherwise
  // an import where every secret failed would still look like a partial success.
  const parentPaths = new Set(folderPaths.map(getParentPath));
  const results = [...outcomes]
    .filter(([path]) => path in secretsByPath || !parentPaths.has(path))
    .map(([, outcome]) => outcome)
    .filter((o) => o.status !== "found");
  const okCount = results.filter((o) => o.status === "written" || o.status === "created").length;
  let state: "success" | "partial" | "failed" = "failed";
  if (okCount === results.length) state = "success";
  else if (okCount > 0) state = "partial";

  return {
    state,
    hasApproval: [...outcomes.values()].some((o) => o.hasApproval),
    // Only root causes carry a reason; descendants they blocked are left out
    problems: [...outcomes]
      .filter(([, o]) => o.reason)
      .map(([path, o]) => ({ path, reason: o.reason! }))
  };
};
