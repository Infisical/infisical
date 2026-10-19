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
// or sits under one that could not. "partial" is a folder where some secret batches were
// saved and others were not.
type TWriteStatus = "written" | "partial" | "failed";

type TPathOutcome = {
  status: TWriteStatus | "created" | "found" | "skipped";
  reason?: string;
  hasApproval?: boolean;
};

type TNestedImportHandlers = {
  // Resolves false when the folder is missing and cannot be created
  resolveFolder: (path: string) => Promise<"created" | "found" | false>;
  writeSecrets: (
    path: string,
    secrets: TParsedEnv
  ) => Promise<{ status: TWriteStatus; hasApproval: boolean; reason?: string }>;
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
        const { status, hasApproval, reason } = await writeSecrets(path, secrets);
        const reasons = {
          written: undefined,
          partial: "some secrets could not be saved",
          failed: "secrets could not be saved"
        };
        outcomes.set(path, { status, reason: reason ?? reasons[status], hasApproval });
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
  const partialCount = results.filter((o) => o.status === "partial").length;
  let state: "success" | "partial" | "failed" = "failed";
  if (okCount === results.length) state = "success";
  else if (okCount > 0 || partialCount > 0) state = "partial";

  return {
    state,
    hasApproval: [...outcomes.values()].some((o) => o.hasApproval),
    // Only root causes carry a reason; descendants they blocked are left out
    problems: [...outcomes]
      .filter(([, o]) => o.reason)
      .map(([path, o]) => ({ path, reason: o.reason! }))
  };
};

type TFolderResolverHandlers = {
  listFolderNames: (parentPath: string) => Promise<string[]>;
  canCreateFolder: (parentPath: string) => boolean;
  createFolder: (parentPath: string, name: string) => Promise<unknown>;
};

// Folder-list requests are rate limited, so each parent is listed at most once per run, and
// never under a folder created in this run, since a new folder cannot have children yet
export const createFolderResolver = ({
  listFolderNames,
  canCreateFolder,
  createFolder
}: TFolderResolverHandlers) => {
  const namesByParent = new Map<string, Set<string>>();

  return async (path: string): Promise<"created" | "found" | false> => {
    const parentPath = getParentPath(path);
    const name = path.slice(path.lastIndexOf("/") + 1);
    let names = namesByParent.get(parentPath);
    if (!names) {
      names = new Set(await listFolderNames(parentPath));
      namesByParent.set(parentPath, names);
    }
    if (names.has(name)) return "found";
    if (!canCreateFolder(parentPath)) return false;

    try {
      await createFolder(parentPath, name);
    } catch (error) {
      // Someone else may have created it after our list; reuse it if it is there now
      const latestNames = new Set(await listFolderNames(parentPath));
      namesByParent.set(parentPath, latestNames);
      if (latestNames.has(name)) return "found";
      throw error;
    }
    names.add(name);
    namesByParent.set(path, new Set());
    return "created";
  };
};

// Splits one batch into consecutive requests that each serialize to at most maxBytes, measuring
// the exact JSON body that is sent. A secret too large to fit on its own is left out and returned.
export const chunkSecretsByRequestSize = <T>(
  envelope: Record<string, unknown>,
  secrets: T[],
  maxBytes: number
) => {
  const encoder = new TextEncoder();
  const byteSize = (value: unknown) => encoder.encode(JSON.stringify(value)).length;
  const emptyRequestBytes = byteSize({ ...envelope, secrets: [] });

  const chunks: T[][] = [];
  let current: T[] = [];
  let currentBytes = emptyRequestBytes;
  const oversized: T[] = [];
  secrets.forEach((secret) => {
    const secretBytes = byteSize(secret);
    if (emptyRequestBytes + secretBytes > maxBytes) {
      oversized.push(secret);
      return;
    }
    // Every secret after the first in a request adds a separating comma
    if (current.length && currentBytes + secretBytes + 1 > maxBytes) {
      chunks.push(current);
      current = [];
      currentBytes = emptyRequestBytes;
    }
    currentBytes += secretBytes + (current.length ? 1 : 0);
    current.push(secret);
  });
  if (current.length) chunks.push(current);

  return { chunks, oversized };
};

export type TQueueProgress = { completed: number; queued: number; waitMs: number };

// Avoids AbortSignal.reason and throwIfAborted, which are newer than the build's browser targets
const abortedError = () => new DOMException("The import was cancelled", "AbortError");

const throwIfAborted = (signal?: AbortSignal) => {
  if (signal?.aborted) throw abortedError();
};

const waitUnlessAborted = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortedError());
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer);
        reject(abortedError());
      },
      { once: true }
    );
  });

// The secret endpoints share one per-IP, per-minute limit (60 by default), so a nested import
// sends its requests one at a time, in the order they are queued. A rate-limited request waits
// for the delay the server asks for and is retried once before it counts as failed. Once the
// signal aborts, no new request starts and a pending wait ends; requests already sent finish.
export const createRateLimitedQueue = ({
  getRateLimitDelayMs,
  signal,
  onProgress,
  wait = waitUnlessAborted
}: {
  getRateLimitDelayMs: (error: unknown) => number | null;
  signal?: AbortSignal;
  onProgress?: (progress: TQueueProgress) => void;
  wait?: (ms: number, signal?: AbortSignal) => Promise<void>;
}) => {
  let tail: Promise<unknown> = Promise.resolve();
  const progress: TQueueProgress = { completed: 0, queued: 0, waitMs: 0 };
  const report = (update: Partial<TQueueProgress> = {}) => {
    Object.assign(progress, update);
    onProgress?.({ ...progress });
  };

  return <T>(request: () => Promise<T>): Promise<T> => {
    const run = async () => {
      try {
        throwIfAborted(signal);
        try {
          return await request();
        } catch (error) {
          const delayMs = getRateLimitDelayMs(error);
          if (delayMs === null) throw error;
          report({ waitMs: delayMs });
          await wait(delayMs, signal);
          report({ waitMs: 0 });
          throwIfAborted(signal);
          return await request();
        }
      } finally {
        report({ completed: progress.completed + 1, waitMs: 0 });
      }
    };
    report({ queued: progress.queued + 1 });
    const result = tail.then(run, run);
    tail = result.catch(() => undefined);
    return result;
  };
};
