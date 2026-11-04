import ms from "ms";

import { ProjectPermissionSecretActions } from "@app/context/ProjectPermissionContext/types";
import { PendingAction } from "@app/hooks/api/secretFolders/types";
import { type SecretVersions, SecretType } from "@app/hooks/api/secrets/types";

import type { SecretsFlowsAdapter } from "./contract-flows";
import { fakeLeaseData } from "./demo-leases";
import { secretsManagedDemo } from "./demo-managed";
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
import type { DemoSecret, DemoVersion, SecretsFixtures } from "./fixtures";

type Scoped = { projectId: string; environment: string; path: string };

const versionsOf = (store: DemoStore, secret: DemoSecret): SecretVersions[] => {
  const history = store.get().versionHistory[secret.id] ?? [];
  const current: DemoVersion = {
    version: secret.version,
    value: secret.value ?? "",
    createdAt: secret.updatedAt,
    actor: "Sarah Lin",
    actorType: "user"
  };
  const entries = history.some((entry) => entry.version === secret.version)
    ? history
    : [current, ...history];
  return entries.map((entry) => ({
    id: `${secret.id}:v${entry.version}`,
    secretId: secret.id,
    version: entry.version,
    project: secret.projectId,
    type: SecretType.Shared,
    isDeleted: false,
    envId: secret.env,
    secretKey: secret.key,
    secretValueHidden: false,
    tags: secret.tags ?? [],
    __v: 0,
    createdAt: entry.createdAt,
    updatedAt: entry.createdAt,
    actor: { actorType: entry.actorType, name: entry.actor },
    isRedacted: Boolean(entry.redacted),
    redactedByActor: entry.redacted
      ? { username: "sarah@acme.dev", email: "sarah@acme.dev", projectMembershipId: null }
      : null,
    redactedAt: entry.redacted ? entry.createdAt : null,
    redactedByUserId: entry.redacted ? "demo-user-sarah" : null
  }));
};

const all = Object.values(ProjectPermissionSecretActions).filter(
  (action) => action !== ProjectPermissionSecretActions.Subscribe
);
const reading = [
  ProjectPermissionSecretActions.DescribeSecret,
  ProjectPermissionSecretActions.ReadValue
];

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

const dynamicAt =
  (projectSlug: string, environmentSlug: string, path: string, name: string) =>
  (entry: SecretsFixtures["dynamicSecrets"][number]) =>
    entry.projectId === projectSlug &&
    entry.environment === environmentSlug &&
    entry.path === path &&
    entry.name === name;

export const secretsFlowsDemo: SecretsFlowsAdapter = {
  ...secretsManagedDemo,
  useDynamicSecretDetails: ({ projectSlug, environmentSlug, path, name }) => {
    const entry = useStore()
      .use()
      .dynamicSecrets.find(dynamicAt(projectSlug, environmentSlug, path, name));
    return {
      data: entry ? { ...entry, inputs: entry.inputs ?? {} } : undefined,
      isPending: !entry,
      error: null
    };
  },
  useCreateDynamicSecret: demoMutation((store, dto) => {
    const timestamp = now();
    store.update((state) => ({
      ...state,
      dynamicSecrets: [
        ...state.dynamicSecrets,
        {
          id: crypto.randomUUID(),
          name: dto.name,
          type: dto.provider.type,
          defaultTTL: dto.defaultTTL,
          maxTTL: dto.maxTTL,
          usernameTemplate: dto.usernameTemplate,
          metadata: dto.metadata,
          tags: dto.tags,
          inputs: dto.provider.inputs,
          createdAt: timestamp,
          updatedAt: timestamp,
          projectId: dto.projectSlug,
          environment: dto.environmentSlug,
          path: dto.path
        }
      ]
    }));
    return {};
  }),
  useUpdateDynamicSecret: demoMutation((store, dto) => {
    store.update((state) => ({
      ...state,
      dynamicSecrets: state.dynamicSecrets.map((entry) =>
        dynamicAt(dto.projectSlug, dto.environmentSlug, dto.path, dto.name)(entry)
          ? {
              ...entry,
              name: dto.data.newName ?? entry.name,
              defaultTTL: dto.data.defaultTTL ?? entry.defaultTTL,
              maxTTL: dto.data.maxTTL ?? undefined,
              inputs: dto.data.inputs ?? entry.inputs,
              usernameTemplate: dto.data.usernameTemplate ?? entry.usernameTemplate,
              metadata: dto.data.metadata ?? entry.metadata,
              updatedAt: now()
            }
          : entry
      )
    }));
    return {};
  }),
  useDeleteDynamicSecret: demoMutation((store, dto) => {
    store.update((state) => ({
      ...state,
      dynamicSecrets: state.dynamicSecrets.filter(
        (entry) => !dynamicAt(dto.projectSlug, dto.environmentSlug, dto.path, dto.name)(entry)
      )
    }));
    return {};
  }),
  useDynamicSecretLeases: ({ projectSlug, environmentSlug, path, dynamicSecretName, enabled }) => {
    const state = useStore().use();
    const entry = state.dynamicSecrets.find(
      dynamicAt(projectSlug, environmentSlug, path, dynamicSecretName)
    );
    if (enabled === false || !entry) return { data: undefined, isPending: true, error: null };
    return { data: state.leases[entry.id] ?? [], isPending: false, error: null };
  },
  useCreateDynamicSecretLease: demoMutation((store, dto) => {
    const entry = store
      .get()
      .dynamicSecrets.find(
        dynamicAt(dto.projectSlug, dto.environmentSlug, dto.path, dto.dynamicSecretName)
      );
    if (!entry) throw new Error("Dynamic secret not found");
    const expireAt = new Date(Date.now() + (ms(dto.ttl ?? entry.defaultTTL) || 3600000)).toISOString();
    const lease = {
      id: crypto.randomUUID(),
      version: 1,
      expireAt,
      dynamicSecretId: entry.id,
      createdAt: now(),
      updatedAt: now()
    };
    store.update((state) => ({
      ...state,
      leases: { ...state.leases, [entry.id]: [...(state.leases[entry.id] ?? []), lease] }
    }));
    return { lease, data: fakeLeaseData(dto.provider, entry.name, expireAt, dto.config) };
  }),
  useRenewDynamicSecretLease: demoMutation((store, dto) => {
    store.update((state) => ({
      ...state,
      leases: Object.fromEntries(
        Object.entries(state.leases).map(([key, leases]) => [
          key,
          leases.map((lease) =>
            lease.id === dto.leaseId
              ? {
                  ...lease,
                  expireAt: new Date(
                    new Date(lease.expireAt).getTime() + (ms(dto.ttl ?? "1h") || 0)
                  ).toISOString()
                }
              : lease
          )
        ])
      )
    }));
    return {};
  }),
  useRevokeDynamicSecretLease: demoMutation((store, dto) => {
    store.update((state) => ({
      ...state,
      leases: Object.fromEntries(
        Object.entries(state.leases).map(([key, leases]) => [
          key,
          leases.filter((lease) => lease.id !== dto.leaseId)
        ])
      )
    }));
    return {};
  }),
  useSecretVersions: ({ secretId }) => {
    const store = useStore();
    const state = store.use();
    const secret = state.secrets.find((entry) => entry.id === secretId);
    return {
      data: secret ? versionsOf(store, secret) : undefined,
      isPending: !secret,
      error: null
    };
  },
  useSecretVersionValue: ({ secretId, version }, options) => {
    const state = useStore().use();
    if (options?.enabled === false) return { data: undefined, isPending: true, error: null };
    const secret = state.secrets.find((entry) => entry.id === secretId);
    const entry = state.versionHistory[secretId]?.find((item) => item.version === version);
    let value = entry?.value;
    if (entry?.redacted) value = "";
    else if (value === undefined && secret?.version === version) value = secret.value;
    return { data: value, isPending: false, error: null };
  },
  useRedactSecretVersion: demoMutation((store, { versionId, secretId }) => {
    const version = Number(versionId.split(":v").at(-1));
    const secret = store.get().secrets.find((entry) => entry.id === secretId);
    if (!secret) return {};
    store.update((state) => ({
      ...state,
      versionHistory: {
        ...state.versionHistory,
        [secretId]: versionsOf(store, secret).map((entry) => ({
          version: entry.version,
          value:
            state.versionHistory[secretId]?.find((item) => item.version === entry.version)?.value ??
            (entry.version === secret.version ? (secret.value ?? "") : ""),
          createdAt: entry.createdAt,
          actor: entry.actor?.name ?? "Sarah Lin",
          actorType: entry.actor?.actorType ?? "user",
          redacted: entry.isRedacted || entry.version === version
        }))
      }
    }));
    return {};
  }),
  useSecretAccessList: () => ({
    data: {
      users: [
        {
          id: "user-sarah",
          membershipId: "membership-sarah",
          name: "Sarah Lin",
          allowedActions: all
        },
        {
          id: "user-jordan",
          membershipId: "membership-jordan",
          name: "Jordan Lee",
          allowedActions: [...reading, ProjectPermissionSecretActions.Edit]
        }
      ],
      identities: [
        {
          id: "identity-ci",
          membershipId: "membership-ci",
          name: "ci-deployer",
          allowedActions: reading
        }
      ],
      groups: [
        {
          id: "group-platform",
          membershipId: "membership-platform",
          name: "Platform team",
          allowedActions: [...reading, ProjectPermissionSecretActions.Create],
          userIds: ["user-jordan"],
          identityIds: []
        }
      ]
    },
    isPending: false,
    error: null
  }),
  useCreateSharedSecret: demoMutation(() => ({ id: crypto.randomUUID() })),
  useCreateReminder: (secretId) => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        const reminder = {
          id: crypto.randomUUID(),
          secretId,
          message: dto.message,
          repeatDays: dto.repeatDays,
          nextReminderDate: dto.nextReminderDate,
          fromDate: dto.fromDate,
          recipients: dto.recipients
        };
        updateSecrets(
          store,
          (secret) => secret.id === secretId,
          (secret) => ({ ...secret, reminder })
        );
        return reminder;
      }
    };
  },
  useDeleteReminder: (secretId) => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ reminderId }) => {
        updateSecrets(
          store,
          (secret) => secret.id === secretId,
          (secret) => ({
            ...secret,
            reminder: undefined,
            reminderRepeatDays: undefined,
            reminderNote: undefined
          })
        );
        return { id: reminderId, secretId };
      }
    };
  },
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
