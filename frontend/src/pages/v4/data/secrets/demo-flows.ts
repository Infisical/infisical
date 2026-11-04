import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { SecretType } from "@app/hooks/api/secrets/types";

import type { SecretsFlowsAdapter } from "./contract-flows";
import {
  childPath,
  demoMutation,
  type DemoStore,
  now,
  sanitize,
  secretAt,
  updateSecrets,
  useStore,
  within
} from "./demo-store";
import type { DemoSecret, SecretsFixtures } from "./fixtures";

type Scoped = { projectId: string; environment: string; path: string };

const newSecret = (
  store: DemoStore,
  scope: { projectId: string; environment: string; path: string },
  input: {
    secretKey: string;
    secretValue: string;
    secretComment?: string;
    tagIds?: string[];
    skipMultilineEncoding?: boolean | null;
    secretMetadata?: { key: string; value: string; isEncrypted?: boolean }[];
  }
): DemoSecret => {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    projectId: scope.projectId,
    env: scope.environment,
    path: scope.path,
    key: input.secretKey,
    value: input.secretValue,
    isEmpty: input.secretValue === "",
    secretValueHidden: false,
    version: 1,
    comment: input.secretComment ?? "",
    tags: store.get().tags.filter((tag) => input.tagIds?.includes(tag.id)),
    secretMetadata: input.secretMetadata ?? [],
    skipMultilineEncoding: input.skipMultilineEncoding,
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

export const upsertSecrets = (
  store: DemoStore,
  scope: { projectId: string; environment: string; path: string },
  inputs: Parameters<typeof newSecret>[2][]
) =>
  store.update((state) => {
    let { secrets } = state;
    inputs.forEach((input) => {
      const match = secretAt(scope.projectId, scope.environment, scope.path, input.secretKey);
      secrets = secrets.some(match)
        ? secrets.map((secret) =>
            match(secret)
              ? {
                  ...secret,
                  value: input.secretValue,
                  isEmpty: input.secretValue === "",
                  version: secret.version + 1,
                  updatedAt: now()
                }
              : secret
          )
        : [...secrets, newSecret(store, scope, input)];
    });
    return { ...state, secrets };
  });

const moveScoped = <T extends Scoped>(
  items: T[],
  projectId: string,
  environment: string,
  from: string,
  to: { environment: string; path: string }
) =>
  items.map((item) =>
    item.projectId === projectId && item.environment === environment && within(item.path, from)
      ? { ...item, environment: to.environment, path: to.path + item.path.slice(from.length) }
      : item
  );

const removeEnvironment = (state: SecretsFixtures, projectId: string, slug: string) => {
  const keep = (entry: { projectId: string; environment: string }) =>
    entry.projectId !== projectId || entry.environment !== slug;
  return {
    ...state,
    projects: state.projects.map((project) =>
      project.id === projectId
        ? {
            ...project,
            environments: project.environments.filter((environment) => environment.slug !== slug)
          }
        : project
    ),
    secrets: state.secrets.filter(
      (secret) => secret.projectId !== projectId || secret.env !== slug
    ),
    folders: state.folders.filter(keep),
    imports: state.imports.filter(keep),
    dynamicSecrets: state.dynamicSecrets.filter(keep),
    rotations: state.rotations.filter(
      (entry) => entry.projectId !== projectId || entry.environment.slug !== slug
    ),
    honeyTokens: state.honeyTokens.filter(
      (entry) => entry.projectId !== projectId || entry.environment.slug !== slug
    ),
    proxiedServices: state.proxiedServices.filter(
      (entry) => entry.projectId !== projectId || entry.environment.slug !== slug
    )
  };
};

export const secretsFlowsDemo: SecretsFlowsAdapter = {
  useProjectFolders: (projectId) => {
    const state = useStore().use();
    const project = state.projects.find((entry) => entry.id === projectId);
    return {
      data: Object.fromEntries(
        (project?.environments ?? []).map((environment) => [
          environment.id,
          {
            ...environment,
            folders: [
              { id: `${projectId}:${environment.slug}:root`, name: "root", path: "/" },
              ...state.folders
                .filter(
                  (folder) =>
                    folder.projectId === projectId && folder.environment === environment.slug
                )
                .map((folder) => ({
                  id: folder.id,
                  name: folder.name,
                  description: folder.description,
                  path: childPath(folder.path, folder.name)
                }))
            ]
          }
        ])
      ),
      isPending: false,
      error: null
    };
  },
  useSecretsAt: ({ projectId, environment, secretPath = "/", viewSecretValue, options }) => {
    const state = useStore().use();
    if (options?.enabled === false) return { data: undefined, isPending: true, error: null };
    return {
      data: state.secrets
        .filter(
          (secret) =>
            secret.projectId === projectId &&
            secret.env === environment &&
            secret.path === secretPath
        )
        .map((secret) => ({
          ...sanitize(secret),
          ...(viewSecretValue ? { value: secret.value } : {})
        })),
      isPending: false,
      error: null
    };
  },
  useCreateSecretBatch: demoMutation((store, dto) => {
    upsertSecrets(
      store,
      { projectId: dto.projectId, environment: dto.environment, path: dto.secretPath },
      dto.secrets
    );
    return {};
  }),
  useUpdateSecretBatch: demoMutation((store, dto) => {
    const { tags } = store.get();
    dto.secrets.forEach((input) =>
      updateSecrets(
        store,
        secretAt(dto.projectId, dto.environment, dto.secretPath, input.secretKey),
        (secret) =>
          input.type === SecretType.Personal
            ? { ...secret, idOverride: `${secret.id}:override`, valueOverride: input.secretValue }
            : {
                ...secret,
                value: input.secretValue ?? secret.value,
                isEmpty: (input.secretValue ?? secret.value) === "",
                comment: input.secretComment ?? secret.comment,
                tags: input.tagIds
                  ? tags.filter((tag) => input.tagIds?.includes(tag.id))
                  : secret.tags,
                secretMetadata: input.secretMetadata ?? secret.secretMetadata,
                skipMultilineEncoding: input.skipMultilineEncoding ?? secret.skipMultilineEncoding,
                version:
                  input.secretValue !== undefined && input.secretValue !== secret.value
                    ? secret.version + 1
                    : secret.version,
                updatedAt: now()
              }
      )
    );
    return {};
  }),
  useMoveSecrets: demoMutation((store, dto) => {
    store.update((state) => {
      const moving = state.secrets.filter((secret) => dto.secretIds.includes(secret.id));
      const keys = moving.map((secret) => secret.key);
      const conflicts = state.secrets.filter(
        (secret) =>
          secret.projectId === dto.projectId &&
          secret.env === dto.destinationEnvironment &&
          secret.path === dto.destinationSecretPath &&
          keys.includes(secret.key)
      );
      const blocked = dto.shouldOverwrite ? [] : conflicts.map((secret) => secret.key);
      return {
        ...state,
        secrets: state.secrets
          .filter((secret) => !dto.shouldOverwrite || !conflicts.includes(secret))
          .map((secret) =>
            dto.secretIds.includes(secret.id) && !blocked.includes(secret.key)
              ? {
                  ...secret,
                  env: dto.destinationEnvironment,
                  path: dto.destinationSecretPath,
                  updatedAt: now()
                }
              : secret
          )
      };
    });
    return { isSourceUpdated: true, isDestinationUpdated: true };
  }),
  useMoveFolder: demoMutation((store, dto) => {
    const folder = store.get().folders.find((entry) => entry.id === dto.folderId);
    if (!folder) throw new Error("Folder not found");
    const from = childPath(folder.path, folder.name);
    const to = {
      environment: dto.destinationEnvironment,
      path: childPath(dto.destinationPath, folder.name)
    };
    store.update((state) => ({
      ...state,
      folders: moveScoped(
        state.folders.map((entry) =>
          entry.id === folder.id
            ? { ...entry, environment: dto.destinationEnvironment, path: dto.destinationPath }
            : entry
        ),
        folder.projectId,
        folder.environment,
        from,
        to
      ),
      imports: moveScoped(state.imports, folder.projectId, folder.environment, from, to),
      dynamicSecrets: moveScoped(
        state.dynamicSecrets,
        folder.projectId,
        folder.environment,
        from,
        to
      ),
      secrets: state.secrets.map((secret) =>
        secret.projectId === folder.projectId &&
        secret.env === folder.environment &&
        within(secret.path, from)
          ? { ...secret, env: to.environment, path: to.path + secret.path.slice(from.length) }
          : secret
      )
    }));
    return {
      folderId: folder.id,
      sourceEnvironment: folder.environment,
      sourcePath: folder.path,
      destinationEnvironment: dto.destinationEnvironment,
      destinationPath: dto.destinationPath,
      hasApprovalRequests: false
    };
  }),
  useCreateCommit: demoMutation((store, dto) => {
    const scope = { projectId: dto.projectId, environment: dto.environment, path: dto.secretPath };
    dto.pendingChanges.secrets.forEach((change) => {
      const match = secretAt(dto.projectId, dto.environment, dto.secretPath, change.secretKey);
      if (change.type === PendingAction.Create) {
        upsertSecrets(store, scope, [{ ...change, tagIds: change.tags?.map((tag) => tag.id) }]);
        return;
      }
      if (change.type === PendingAction.Delete) {
        updateSecrets(store, match, () => null);
        return;
      }
      const { tags } = store.get();
      updateSecrets(store, match, (secret) => ({
        ...secret,
        key: change.newSecretName ?? secret.key,
        value: change.secretValue ?? secret.value,
        isEmpty: (change.secretValue ?? secret.value) === "",
        comment: change.secretComment ?? secret.comment,
        tags: change.tags
          ? tags.filter((tag) => change.tags?.some((entry) => entry.id === tag.id))
          : secret.tags,
        secretMetadata: change.secretMetadata ?? secret.secretMetadata,
        skipMultilineEncoding: change.skipMultilineEncoding ?? secret.skipMultilineEncoding,
        version: change.secretValue !== undefined ? secret.version + 1 : secret.version,
        updatedAt: now()
      }));
    });
    store.update((state) => {
      let { folders } = state;
      dto.pendingChanges.folders.forEach((change) => {
        if (change.type === PendingAction.Create)
          folders = [
            ...folders,
            {
              id: crypto.randomUUID(),
              name: change.folderName,
              description: change.description ?? "",
              ...scope
            }
          ];
        else if (change.type === PendingAction.Update)
          folders = folders.map((folder) =>
            folder.id === change.id
              ? { ...folder, name: change.folderName, description: change.description ?? "" }
              : folder
          );
        else folders = folders.filter((folder) => folder.id !== change.id);
      });
      return { ...state, folders };
    });
    return {
      commitId: crypto.randomUUID(),
      approval: null,
      secrets: { created: [], updated: [], deleted: [] },
      folders: { created: [], updated: [], deleted: [] }
    };
  }),
  useDeleteEnvironment: demoMutation((store, dto) => {
    const project = store.get().projects.find((entry) => entry.id === dto.projectId);
    const environment = project?.environments.find((entry) => entry.id === dto.id);
    if (environment)
      store.update((state) => removeEnvironment(state, dto.projectId, environment.slug));
    return {};
  }),
  useCreateSecretImport: demoMutation((store, dto) => {
    const project = store.get().projects.find((entry) => entry.id === dto.projectId);
    const source = project?.environments.find((entry) => entry.slug === dto.import.environment);
    if (!source) throw new Error("Source environment not found");
    const timestamp = now();
    store.update((state) => ({
      ...state,
      imports: [
        ...state.imports,
        {
          id: crypto.randomUUID(),
          folderId: `${dto.projectId}:${dto.environment}:${dto.path ?? "/"}`,
          importPath: dto.import.path,
          importEnv: source,
          position: String(state.imports.length + 1),
          createdAt: timestamp,
          updatedAt: timestamp,
          isReplication: dto.isReplication,
          isReplicationSuccess: dto.isReplication ? true : undefined,
          replicationStatus: dto.isReplication ? "succeeded" : undefined,
          lastReplicated: dto.isReplication ? timestamp : undefined,
          projectId: dto.projectId,
          environment: dto.environment,
          path: dto.path ?? "/"
        }
      ]
    }));
    return {};
  }),
  useDeleteSecretImport: demoMutation((store, dto) => {
    store.update((state) => ({
      ...state,
      imports: state.imports.filter((entry) => entry.id !== dto.id)
    }));
    return {};
  }),
  useResyncSecretImport: demoMutation((store, dto) => {
    store.update((state) => ({
      ...state,
      imports: state.imports.map((entry) =>
        entry.id === dto.id
          ? {
              ...entry,
              isReplicationSuccess: true,
              replicationStatus: "succeeded",
              lastReplicated: now()
            }
          : entry
      )
    }));
    return {};
  })
};
