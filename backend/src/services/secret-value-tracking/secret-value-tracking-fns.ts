import { JobState } from "@app/queue/queue-service";

import {
  TAdvanceCursorInput,
  TAdvanceCursorResult,
  TBackfillCursor,
  TBackfillRunState
} from "./secret-value-tracking-types";

export const BACKFILL_STALE_AFTER_MS = 15 * 60 * 1000;

const startOfFolder = (projectId: string, folderId: string): TBackfillCursor => ({
  projectId,
  folderId,
  key: "",
  id: ""
});

// Resolves to the first project from `fromIndex` that still has folders, so a project deleted or
// emptied between chunks is stepped over rather than stalling the walk on something that is no
// longer there.
const firstProjectWithFolders = (
  projectIds: string[],
  folderIdsByProject: Record<string, string[]>,
  fromIndex: number
) => {
  for (let i = fromIndex; i < projectIds.length; i += 1) {
    const projectId = projectIds[i];
    const folderIds = folderIdsByProject[projectId] ?? [];
    if (folderIds.length) return { projectId, folderId: folderIds[0] };
  }
  return null;
};

export const advanceCursor = ({
  cursor,
  projectIds,
  folderIdsByProject,
  lastRow,
  folderExhausted
}: TAdvanceCursorInput): TAdvanceCursorResult => {
  if (!cursor) {
    const next = firstProjectWithFolders(projectIds, folderIdsByProject, 0);
    if (!next) return { done: true };
    return { done: false, cursor: startOfFolder(next.projectId, next.folderId), completedProjectId: null };
  }

  const projectIndex = projectIds.indexOf(cursor.projectId);
  if (projectIndex === -1) {
    const next = firstProjectWithFolders(projectIds, folderIdsByProject, 0);
    if (!next) return { done: true };
    return { done: false, cursor: startOfFolder(next.projectId, next.folderId), completedProjectId: null };
  }

  const folderIds = folderIdsByProject[cursor.projectId] ?? [];
  const folderIndex = folderIds.indexOf(cursor.folderId);

  // The cursor's folder is gone. Folder ids are sorted, so resuming at the first one past it keeps
  // the walk moving forward rather than re-reading everything this project already covered.
  if (folderIndex === -1) {
    const nextFolderId = folderIds.find((folderId) => folderId > cursor.folderId);
    if (nextFolderId) {
      return { done: false, cursor: startOfFolder(cursor.projectId, nextFolderId), completedProjectId: null };
    }
    const next = firstProjectWithFolders(projectIds, folderIdsByProject, projectIndex + 1);
    if (!next) return { done: true };
    return {
      done: false,
      cursor: startOfFolder(next.projectId, next.folderId),
      completedProjectId: folderIds.length ? cursor.projectId : null
    };
  }

  if (!folderExhausted && lastRow) {
    return {
      done: false,
      cursor: { projectId: cursor.projectId, folderId: cursor.folderId, key: lastRow.key, id: lastRow.id },
      completedProjectId: null
    };
  }

  if (folderIndex + 1 < folderIds.length) {
    return {
      done: false,
      cursor: startOfFolder(cursor.projectId, folderIds[folderIndex + 1]),
      completedProjectId: null
    };
  }

  const next = firstProjectWithFolders(projectIds, folderIdsByProject, projectIndex + 1);
  if (!next) return { done: true };
  return { done: false, cursor: startOfFolder(next.projectId, next.folderId), completedProjectId: cursor.projectId };
};

export const needsBackfill = (row: {
  secretValueBlindIndex?: string | null;
  secretValueOrgBlindIndex?: string | null;
  encryptedValue?: Buffer | null;
}) => Boolean(row.encryptedValue) && (!row.secretValueBlindIndex || !row.secretValueOrgBlindIndex);

// Completion lives on the durable flag rather than in the run state, so a key that outlives a
// finished run can never contradict it.
export const resolveRunStatus = (
  state: TBackfillRunState | null,
  flagEnabled: boolean,
  now: Date
): { status: JobState; message?: string } => {
  if (flagEnabled) return { status: JobState.Completed };
  if (!state) return { status: JobState.NotFound };
  if (state.status === "failed") return { status: JobState.Failed, message: state.error ?? "Unknown error" };

  const lastProgress = new Date(state.lastProgressAt).getTime();
  if (Number.isNaN(lastProgress) || now.getTime() - lastProgress > BACKFILL_STALE_AFTER_MS) {
    return {
      status: JobState.Failed,
      message: "The backfill stopped responding. Start it again to resume from where it left off."
    };
  }

  return { status: JobState.Pending };
};

// The status endpoint answers from this, so a payload it cannot use has to read as "no run in
// progress" rather than reach the response schema. The counters matter as much as the timestamp:
// a non-numeric one becomes NaN, which `z.number()` rejects, turning a graceful degrade into a 500.
export const isUsableRunState = (value: unknown): value is TBackfillRunState => {
  const state = value as Partial<TBackfillRunState> | null;
  if (!state || typeof state !== "object") return false;
  if (state.status !== "running" && state.status !== "failed" && state.status !== "completed") return false;
  if (typeof state.lastProgressAt !== "string") return false;

  return (["projectsTotal", "projectsDone", "secretsProcessed"] as const).every((field) =>
    Number.isFinite(state[field])
  );
};
