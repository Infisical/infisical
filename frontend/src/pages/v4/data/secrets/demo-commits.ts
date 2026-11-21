import type {
  Commit,
  CommitWithChanges,
  RollbackPreview,
  TFolderCommitChanges
} from "@app/hooks/api/folderCommits/types";
import { CommitType } from "@app/hooks/api/secretApprovalRequest/types";

import type { SecretsCommitsAdapter } from "./contract-commits";
import type { DemoCommit, DemoCommitChange, Snapshot } from "./demo-commits-seed";
import { type DemoStore, now, updateSecrets, useStore } from "./demo-store";
import type { DemoSecret } from "./fixtures";

const nameOf = (change: DemoCommitChange) => (change.after ?? change.before)?.name ?? "";

const actionOf = (change: DemoCommitChange) => {
  if (!change.before) return CommitType.CREATE;
  if (!change.after) return CommitType.DELETE;
  return CommitType.UPDATE;
};

const versionOf = (change: DemoCommitChange, snapshot: Snapshot, version: number) =>
  change.type === "secret"
    ? {
        version,
        secretKey: snapshot.name,
        secretValue: snapshot.value,
        secretComment: snapshot.comment,
        secretValueHidden: false,
        tags: []
      }
    : { version, name: snapshot.name, description: snapshot.description };

const versionsOf = (change: DemoCommitChange) =>
  [
    change.before && versionOf(change, change.before, 1),
    change.after && versionOf(change, change.after, change.before ? 2 : 1)
  ].filter(Boolean);

const toCommit = (commit: DemoCommit): Commit => {
  const count = (action: CommitType) =>
    commit.changes.filter((change) => actionOf(change) === action).length;
  return {
    id: commit.id,
    folderId: `${commit.projectId}:${commit.environment}:${commit.path}`,
    message: commit.message,
    createdAt: commit.createdAt,
    actorType: "user",
    actorMetadata: { name: commit.actor },
    summary: {
      secretCount: commit.changes.filter((change) => change.type === "secret").length,
      folderCount: commit.changes.filter((change) => change.type === "folder").length,
      addedCount: count(CommitType.CREATE),
      updatedCount: count(CommitType.UPDATE),
      deletedCount: count(CommitType.DELETE)
    }
  };
};

const inFolder =
  (scope: { projectId: string; environment: string; directory: string }) => (commit: DemoCommit) =>
    commit.projectId === scope.projectId &&
    commit.environment === scope.environment &&
    commit.path === scope.directory;

const invert = (change: DemoCommitChange): DemoCommitChange => ({
  type: change.type,
  before: change.after,
  after: change.before
});

const laterThan = (commits: DemoCommit[], target: DemoCommit) =>
  commits
    .filter((commit) => inFolder({ ...target, directory: target.path })(commit))
    .filter((commit) => commit.createdAt > target.createdAt)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

const applyChanges = (store: DemoStore, commit: DemoCommit, changes: DemoCommitChange[]) => {
  const timestamp = now();
  changes
    .filter((change) => change.type === "secret")
    .forEach((change) => {
      const name = (change.before ?? change.after)?.name;
      const match = (secret: DemoSecret) =>
        secret.projectId === commit.projectId &&
        secret.env === commit.environment &&
        secret.path === commit.path &&
        secret.key === name;
      if (!change.after) {
        updateSecrets(store, match, () => null);
        return;
      }
      const target = change.after;
      if (!change.before) {
        store.update((state) => ({
          ...state,
          secrets: [
            ...state.secrets,
            {
              id: crypto.randomUUID(),
              projectId: commit.projectId,
              env: commit.environment,
              path: commit.path,
              key: target.name,
              value: target.value ?? "",
              isEmpty: !target.value,
              secretValueHidden: false,
              version: 1,
              comment: target.comment ?? "",
              tags: [],
              secretMetadata: [],
              createdAt: timestamp,
              updatedAt: timestamp
            }
          ]
        }));
        return;
      }
      updateSecrets(store, match, (secret) => ({
        ...secret,
        key: target.name,
        value: target.value ?? secret.value,
        comment: target.comment ?? secret.comment,
        version: secret.version + 1,
        updatedAt: timestamp
      }));
    });
};

export const recordDemoCommit = (store: DemoStore, commit: Omit<DemoCommit, "id" | "createdAt">) =>
  store.update((state) => ({
    ...state,
    commits: [...state.commits, { ...commit, id: crypto.randomUUID(), createdAt: now() }]
  }));

const commitById = (store: DemoStore, commitId: string) => {
  const commit = store.get().commits.find((entry) => entry.id === commitId);
  if (!commit) throw new Error("Commit not found");
  return commit;
};

export const secretsCommitsDemo: SecretsCommitsAdapter = {
  useCommitCount: (scope) => ({
    data: useStore().use().commits.filter(inFolder(scope)).length,
    isPending: false,
    error: null
  }),
  useCommitHistory: ({ enabled = true, search, sort = "desc", ...scope }) => {
    const state = useStore().use();
    const query = search?.trim().toLowerCase();
    const commits = state.commits
      .filter(inFolder(scope))
      .filter(
        (commit) =>
          !query ||
          [commit.message, commit.id, ...commit.changes.map(nameOf)]
            .join("\n")
            .toLowerCase()
            .includes(query)
      )
      .sort((a, b) =>
        sort === "desc"
          ? b.createdAt.localeCompare(a.createdAt)
          : a.createdAt.localeCompare(b.createdAt)
      )
      .map(toCommit);
    return {
      data: enabled ? { commits, total: commits.length } : undefined,
      isPending: !enabled,
      error: null,
      fetchNextPage: () => undefined,
      hasNextPage: false
    };
  },
  useCommitDetails: (_projectId, commitId) => {
    const state = useStore().use();
    const commit = state.commits.find((entry) => entry.id === commitId);
    if (!commit) return { data: undefined, isPending: Boolean(commitId), error: null };
    const latest = laterThan(state.commits, commit).length === 0;
    return {
      data: {
        changes: {
          id: commit.id,
          commitId: commit.id,
          actorMetadata: { name: commit.actor },
          actorType: "user",
          message: commit.message,
          folderId: toCommit(commit).folderId,
          envId: commit.environment,
          createdAt: commit.createdAt,
          updatedAt: commit.createdAt,
          isLatest: latest,
          changes: commit.changes.map(
            (change, index) =>
              ({
                id: `${commit.id}:${index}`,
                folderCommitId: commit.id,
                changeType: actionOf(change),
                isUpdate: actionOf(change) === CommitType.UPDATE,
                secretVersionId: null,
                folderVersionId: null,
                createdAt: commit.createdAt,
                updatedAt: commit.createdAt,
                versions: versionsOf(change),
                secretKey: change.type === "secret" ? nameOf(change) : undefined,
                folderName: change.type === "folder" ? nameOf(change) : undefined
              }) as unknown as TFolderCommitChanges
          )
        }
      } as CommitWithChanges,
      isPending: false,
      error: null
    };
  },
  useRollbackPreview: ({ commitId, folderId }) => {
    const state = useStore().use();
    const commit = state.commits.find((entry) => entry.id === commitId);
    if (!commit) return { data: undefined, isPending: Boolean(commitId), error: null };
    const changes = laterThan(state.commits, commit).flatMap((later) => later.changes.map(invert));
    return {
      data: [
        {
          folderId,
          folderName: commit.path,
          folderPath: commit.path,
          changes: changes.map((change, index) => ({
            type: change.type,
            id: `${commitId}:rollback:${index}`,
            versionId: "",
            changeType: actionOf(change) === CommitType.CREATE ? "add" : actionOf(change),
            commitId,
            versions: versionsOf(change),
            secretKey: change.type === "secret" ? nameOf(change) : undefined,
            folderName: change.type === "folder" ? nameOf(change) : undefined
          }))
        }
      ] as RollbackPreview[],
      isPending: false,
      error: null
    };
  },
  useCommitRevert: ({ commitId }) => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async () => {
        const commit = commitById(store, commitId);
        const changes = commit.changes.map(invert);
        applyChanges(store, commit, changes);
        recordDemoCommit(store, {
          ...commit,
          actor: "Sarah Lin",
          message: `Reverted changes from commit ${commit.id}`,
          changes
        });
        return {};
      }
    };
  },
  useCommitRollback: ({ commitId }) => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (message: string) => {
        const commit = commitById(store, commitId);
        const changes = laterThan(store.get().commits, commit).flatMap((later) =>
          later.changes.map(invert)
        );
        applyChanges(store, commit, changes);
        recordDemoCommit(store, { ...commit, actor: "Sarah Lin", message, changes });
        return {};
      }
    };
  }
};
