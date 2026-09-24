export type TBackfillCursor = {
  projectId: string;
  folderId: string;
  key: string;
  id: string;
};

export type TBackfillScope = { scope: "org"; orgId: string } | { scope: "project"; projectId: string };

export type TBackfillRunState = {
  // "completed" carries the final counters so the UI can show what the run got through. It is never
  // the answer to "is it done": that is the durable flag, and this key is allowed to expire.
  status: "running" | "failed" | "completed";
  cursor: TBackfillCursor | null;
  projectsTotal: number;
  projectsDone: number;
  secretsProcessed: number;
  lastProgressAt: string;
  error?: string;
};

export type TAdvanceCursorInput = {
  cursor: TBackfillCursor | null;
  projectIds: string[];
  folderIdsByProject: Record<string, string[]>;
  lastRow: { key: string; id: string } | null;
  folderExhausted: boolean;
};

// `completedProjectId` is how the caller learns the walk just left a project behind, which is the
// moment that project's own blind index flag can be set.
export type TAdvanceCursorResult =
  | { done: true }
  | { done: false; cursor: TBackfillCursor; completedProjectId: string | null };
