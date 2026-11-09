import { useMemo } from "react";

import {
  type DashboardProjectSecretsOverview,
  DashboardSecretsOrderBy,
  type TGetDashboardProjectSecretsOverviewDTO
} from "@app/hooks/api/dashboard/types";
import { OrderByDirection } from "@app/hooks/api/generic/types";
import { ProjectVersion } from "@app/hooks/api/projects/types";
import {
  CommitType,
  type TSecretApprovalRequest
} from "@app/hooks/api/secretApprovalRequest/types";
import {
  type TSecretDependencyTreeNode,
  type TSecretReferenceTraceNode,
  SecretType
} from "@app/hooks/api/secrets/types";

import type { SecretsAdapter } from "./contract";
import { secretsFlowsDemo } from "./demo-flows";
import {
  childPath,
  demoMutation,
  now,
  recordVersion,
  recovered,
  sanitize,
  secretAt,
  updateSecrets,
  useScenario,
  useStore,
  within
} from "./demo-store";
import { DEMO_USER, type DemoSecret, type SecretsFixtures } from "./fixtures";

const overviewOf = (
  state: SecretsFixtures,
  dto: TGetDashboardProjectSecretsOverviewDTO,
  hiddenKeys: string[]
): DashboardProjectSecretsOverview => {
  const needle = (dto.search ?? "").trim().toLowerCase();
  const activeTags = Object.entries(dto.tags ?? {})
    .filter(([, enabled]) => enabled)
    .map(([slug]) => slug);
  const at = (projectId: string, environment: string, path: string) =>
    projectId === dto.projectId &&
    path === dto.secretPath &&
    dto.environments.includes(environment);
  const matches = (name: string) => !needle || name.toLowerCase().includes(needle);
  const allow = (flag: boolean | undefined) => flag !== false && !activeTags.length;

  const imports = allow(dto.includeImports)
    ? state.imports.filter(
        (entry) => at(entry.projectId, entry.environment, entry.path) && matches(entry.importPath)
      )
    : [];
  const folders = allow(dto.includeFolders)
    ? state.folders.filter(
        (entry) => at(entry.projectId, entry.environment, entry.path) && matches(entry.name)
      )
    : [];
  const dynamicSecrets = allow(dto.includeDynamicSecrets)
    ? state.dynamicSecrets.filter(
        (entry) => at(entry.projectId, entry.environment, entry.path) && matches(entry.name)
      )
    : [];
  const rotations = allow(dto.includeSecretRotations)
    ? state.rotations.filter(
        (entry) =>
          at(entry.projectId, entry.environment.slug, entry.folder.path) && matches(entry.name)
      )
    : [];
  const honeyTokens = allow(dto.includeHoneyTokens)
    ? state.honeyTokens.filter(
        (entry) =>
          at(entry.projectId, entry.environment.slug, entry.folder.path) && matches(entry.name)
      )
    : [];
  const proxiedServices = allow(dto.includeProxiedServices)
    ? state.proxiedServices.filter(
        (entry) =>
          at(entry.projectId, entry.environment.slug, entry.folder.path) && matches(entry.name)
      )
    : [];
  const secrets =
    dto.includeSecrets !== false
      ? state.secrets.filter(
          (entry) =>
            at(entry.projectId, entry.env, entry.path) &&
            matches(entry.key) &&
            (!activeTags.length || entry.tags?.some((tag) => activeTags.includes(tag.slug)))
        )
      : [];

  const direction = dto.orderDirection === OrderByDirection.DESC ? -1 : 1;
  const field = dto.orderBy ?? DashboardSecretsOrderBy.Name;
  const ordered = <T>(
    items: T[],
    name: (item: T) => string,
    environment: (item: T) => string,
    stamps: (item: T) => { createdAt: string; updatedAt: string }
  ) => {
    const groups = new Map<string, T[]>();
    items.forEach((item) => groups.set(name(item), [...(groups.get(name(item)) ?? []), item]));
    const sortValue = (key: string) => {
      if (field === DashboardSecretsOrderBy.Name) return key;
      const entries = groups.get(key)!;
      const pick =
        entries.find((entry) => environment(entry) === dto.sortEnvironment) ?? entries[0];
      return stamps(pick)[field];
    };
    return [...groups.keys()].sort((a, b) => sortValue(a).localeCompare(sortValue(b)) * direction);
  };
  const kinds = [
    ordered(
      imports,
      (entry) => entry.id,
      (entry) => entry.environment,
      (entry) => entry
    ),
    ordered(
      folders,
      (entry) => entry.name,
      (entry) => entry.environment,
      () => ({
        createdAt: "",
        updatedAt: ""
      })
    ),
    ordered(
      dynamicSecrets,
      (entry) => entry.name,
      (entry) => entry.environment,
      (entry) => entry
    ),
    ordered(
      rotations,
      (entry) => entry.name,
      (entry) => entry.environment.slug,
      (entry) => entry
    ),
    ordered(
      honeyTokens,
      (entry) => entry.name,
      (entry) => entry.environment.slug,
      (entry) => entry
    ),
    ordered(
      proxiedServices,
      (entry) => entry.name,
      (entry) => entry.environment.slug,
      (entry) => entry
    ),
    ordered(
      secrets,
      (entry) => entry.key,
      (entry) => entry.env,
      (entry) => entry
    )
  ];
  const keys = kinds.flatMap((names, kind) => names.map((name) => `${kind}:${name}`));
  const offset = dto.offset ?? 0;
  const page = new Set(keys.slice(offset, offset + (dto.limit ?? 100)));
  const onPage = (kind: number, name: string) => page.has(`${kind}:${name}`);
  const findSecret = (environment: string, path: string, key: string) =>
    state.secrets.find(
      (entry) =>
        entry.projectId === dto.projectId &&
        entry.env === environment &&
        entry.path === path &&
        entry.key === key
    );
  const unique = (kind: number) => kinds[kind].filter((name) => onPage(kind, name)).length;
  const paged = <T>(items: T[], kind: number, name: (item: T) => string) =>
    items
      .filter((item) => onPage(kind, name(item)))
      .sort((a, b) => kinds[kind].indexOf(name(a)) - kinds[kind].indexOf(name(b)));

  return {
    imports: paged(imports, 0, (entry) => entry.id),
    folders: paged(folders, 1, (entry) => entry.name),
    dynamicSecrets: paged(dynamicSecrets, 2, (entry) => entry.name),
    secretRotations: paged(rotations, 3, (entry) => entry.name).map((entry) => ({
      ...entry,
      secrets: Object.values(entry.secretsMapping).map((key) => {
        const secret = findSecret(entry.environment.slug, entry.folder.path, key);
        return secret ? sanitize(secret) : null;
      })
    })),
    honeyTokens: paged(honeyTokens, 4, (entry) => entry.name),
    proxiedServices: paged(proxiedServices, 5, (entry) => entry.name),
    secrets: paged(secrets, 6, (entry) => entry.key).map((entry) => ({
      ...sanitize(entry),
      secretValueHidden: hiddenKeys.includes(entry.key)
    })),
    totalImportCount: kinds[0].length,
    totalFolderCount: kinds[1].length,
    totalDynamicSecretCount: kinds[2].length,
    totalSecretRotationCount: kinds[3].length,
    totalHoneyTokenCount: kinds[4].length,
    totalProxiedServiceCount: kinds[5].length,
    totalSecretCount: kinds[6].length,
    totalCount: keys.length,
    totalUniqueSecretImportsInPage: unique(0),
    totalUniqueFoldersInPage: unique(1),
    totalUniqueDynamicSecretsInPage: unique(2),
    totalUniqueSecretRotationsInPage: unique(3),
    totalUniqueSecretsInPage: unique(6)
  };
};

type DemoTarget = { env: string; path: string; key: string };

const referencesOf = (secret: DemoSecret): DemoTarget[] =>
  [...(secret.value ?? "").matchAll(/\$\{([^}]+)\}/g)].map((match) => {
    const segments = match[1].trim().split(".");
    if (segments.length === 1) return { env: secret.env, path: secret.path, key: segments[0] };
    return {
      env: segments[0],
      path: `/${segments.slice(1, -1).join("/")}`,
      key: segments.at(-1) ?? ""
    };
  });

const traceOf = (
  state: SecretsFixtures,
  projectId: string,
  target: DemoTarget,
  seen: string[]
): TSecretReferenceTraceNode => {
  const id = `${target.env} ${target.path} ${target.key}`;
  const secret = state.secrets.find(secretAt(projectId, target.env, target.path, target.key));
  return {
    key: target.key,
    value: secret?.value,
    environment: target.env,
    secretPath: target.path,
    children:
      secret && !seen.includes(id)
        ? referencesOf(secret).map((child) => traceOf(state, projectId, child, [...seen, id]))
        : []
  };
};

const expandedOf = (node: TSecretReferenceTraceNode): string =>
  node.children.reduce(
    (value, child) =>
      value.replace(
        /\$\{([^}]+)\}/,
        child.children.length ? expandedOf(child) : (child.value ?? "")
      ),
    node.value ?? ""
  );

const dependentsOf = (
  state: SecretsFixtures,
  projectId: string,
  target: DemoTarget,
  seen: string[]
): TSecretDependencyTreeNode => {
  const id = `${target.env} ${target.path} ${target.key}`;
  return {
    key: target.key,
    environment: target.env,
    secretPath: target.path,
    children: seen.includes(id)
      ? []
      : state.secrets
          .filter(
            (secret) =>
              secret.projectId === projectId &&
              referencesOf(secret).some(
                (reference) =>
                  reference.env === target.env &&
                  reference.path === target.path &&
                  reference.key === target.key
              )
          )
          .map((secret) =>
            dependentsOf(
              state,
              projectId,
              { env: secret.env, path: secret.path, key: secret.key },
              [...seen, id]
            )
          )
  };
};

const reviewed = (request: TSecretApprovalRequest, patch: Partial<TSecretApprovalRequest>) =>
  ({ ...request, ...patch, updatedAt: now() }) as TSecretApprovalRequest;

export const secretsDemo: SecretsAdapter = {
  ...secretsFlowsDemo,
  useProject: (projectId) => {
    const scenario = useScenario();
    const project = useStore()
      .use()
      .projects.find((entry) => entry.id === projectId);
    if (!project)
      return { data: undefined, isPending: false, error: new Error("Project not found") };
    return {
      data: {
        ...project,
        environments: scenario === "no-environments" ? [] : project.environments,
        version: scenario === "legacy" ? ProjectVersion.V2 : project.version
      },
      isPending: false,
      error: null
    };
  },
  useCreateEnvironment: demoMutation((store, dto) => {
    const project = store.get().projects.find((entry) => entry.id === dto.projectId);
    if (!project) throw new Error("Project not found");
    if (project.environments.some((entry) => entry.slug === dto.slug))
      throw new Error("An environment with this slug already exists");
    const environment = {
      id: crypto.randomUUID(),
      name: dto.name,
      slug: dto.slug,
      position: project.environments.length + 1
    };
    store.update((state) => ({
      ...state,
      projects: state.projects.map((entry) =>
        entry.id === dto.projectId
          ? { ...entry, environments: [...entry.environments, environment] }
          : entry
      )
    }));
    return environment;
  }),
  useTags: (projectId) => ({
    data: useStore()
      .use()
      .tags.filter((tag) => tag.projectId === projectId),
    isPending: false,
    error: null
  }),
  useCreateTag: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ projectId, tagSlug, tagColor }) => {
        const timestamp = new Date().toISOString();
        const tag = {
          id: crypto.randomUUID(),
          slug: tagSlug,
          color: tagColor || "",
          projectId,
          createdAt: timestamp,
          updatedAt: timestamp,
          __v: 0
        };
        store.update((state) => ({ ...state, tags: [...state.tags, tag] }));
        return tag;
      }
    };
  },
  useOverview: (dto) => {
    const scenario = useScenario();
    const state = useStore().use();
    const isRecovered = recovered.use();
    const key = JSON.stringify(dto);
    const data = useMemo(
      () => overviewOf(state, dto, scenario === "permissions" ? ["STRIPE_SECRET_KEY"] : []),
      [state, key, scenario]
    );
    const refetch = () => recovered.update(() => true);
    if (scenario === "loading") return { data: undefined, isPending: true, error: null, refetch };
    if (scenario === "error" && !isRecovered)
      return {
        data: undefined,
        isPending: false,
        error: new Error("The demo scenario simulates a timeout."),
        refetch
      };
    return { data, isPending: false, error: null, refetch };
  },
  useSecretValue: (dto, options) => {
    const scenario = useScenario();
    const state = useStore().use();
    if (options?.enabled === false) return { data: undefined, isPending: true, error: null };
    const secret = state.secrets.find(
      secretAt(dto.projectId, dto.environment, dto.secretPath, dto.secretKey)
    );
    if (!secret || (scenario === "permissions" && secret.key === "STRIPE_SECRET_KEY"))
      return { data: undefined, isPending: false, error: new Error("You cannot read this value") };
    return {
      data: dto.isOverride
        ? { value: undefined, valueOverride: secret.valueOverride ?? "" }
        : { value: secret.value ?? "", valueOverride: undefined },
      isPending: false,
      error: null
    };
  },
  useSecretReferenceTree: (dto) => {
    const state = useStore().use();
    const tree = traceOf(
      state,
      dto.projectId,
      { env: dto.environmentSlug, path: dto.secretPath, key: dto.secretKey },
      []
    );
    return { data: { tree, value: expandedOf(tree) }, isPending: false, error: null };
  },
  useSecretReferences: (dto) => {
    const state = useStore().use();
    return {
      data: {
        tree: dependentsOf(
          state,
          dto.projectId,
          { env: dto.environment, path: dto.secretPath, key: dto.secretKey },
          []
        )
      },
      isPending: false,
      error: null
    };
  },
  useCreateSecret: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        if (dto.type === SecretType.Personal) {
          updateSecrets(
            store,
            secretAt(dto.projectId, dto.environment, dto.secretPath, dto.secretKey),
            (secret) => ({
              ...secret,
              idOverride: `${secret.id}:override`,
              valueOverride: dto.secretValue
            })
          );
          return {};
        }
        const timestamp = now();
        const { tags } = store.get();
        const secret: DemoSecret = {
          id: crypto.randomUUID(),
          projectId: dto.projectId,
          env: dto.environment,
          path: dto.secretPath,
          key: dto.secretKey,
          value: dto.secretValue,
          isEmpty: dto.secretValue === "",
          secretValueHidden: false,
          version: 1,
          comment: dto.secretComment,
          tags: tags.filter((tag) => dto.tagIds?.includes(tag.id)),
          secretMetadata: dto.secretMetadata ?? [],
          skipMultilineEncoding: dto.skipMultilineEncoding,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        store.update((state) => ({ ...state, secrets: [...state.secrets, secret] }));
        return {};
      }
    };
  },
  useUpdateSecret: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        const { tags } = store.get();
        const existing = store
          .get()
          .secrets.find(secretAt(dto.projectId, dto.environment, dto.secretPath, dto.secretKey));
        if (
          existing &&
          dto.type !== SecretType.Personal &&
          dto.secretValue !== undefined &&
          dto.secretValue !== existing.value
        )
          recordVersion(store, existing);
        updateSecrets(
          store,
          secretAt(dto.projectId, dto.environment, dto.secretPath, dto.secretKey),
          (secret) => {
            if (dto.type === SecretType.Personal)
              return {
                ...secret,
                idOverride: secret.idOverride ?? `${secret.id}:override`,
                valueOverride: dto.secretValue ?? secret.valueOverride
              };
            const valueChanged = dto.secretValue !== undefined && dto.secretValue !== secret.value;
            return {
              ...secret,
              key: dto.newSecretName ?? secret.key,
              value: dto.secretValue ?? secret.value,
              isEmpty: (dto.secretValue ?? secret.value) === "",
              comment: dto.secretComment ?? secret.comment,
              tags: dto.tagIds ? tags.filter((tag) => dto.tagIds?.includes(tag.id)) : secret.tags,
              secretMetadata: dto.secretMetadata ?? secret.secretMetadata,
              skipMultilineEncoding: dto.skipMultilineEncoding ?? secret.skipMultilineEncoding,
              version: valueChanged ? secret.version + 1 : secret.version,
              updatedAt: now()
            };
          }
        );
        return {};
      }
    };
  },
  useDeleteSecret: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        updateSecrets(
          store,
          secretAt(dto.projectId, dto.environment, dto.secretPath, dto.secretKey),
          (secret) =>
            dto.type === SecretType.Personal
              ? { ...secret, idOverride: undefined, valueOverride: undefined }
              : null
        );
        return {};
      }
    };
  },
  useDeleteSecretBatch: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        const keys = dto.secrets.map((secret) => secret.secretKey);
        updateSecrets(
          store,
          (secret) =>
            secret.projectId === dto.projectId &&
            secret.env === dto.environment &&
            secret.path === dto.secretPath &&
            keys.includes(secret.key),
          () => null
        );
        return {};
      }
    };
  },
  useCreateFolder: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        store.update((state) => ({
          ...state,
          folders: [
            ...state.folders,
            {
              id: crypto.randomUUID(),
              name: dto.name,
              description: dto.description ?? "",
              projectId: dto.projectId,
              environment: dto.environment,
              path: dto.path ?? "/"
            }
          ]
        }));
        return {};
      }
    };
  },
  useUpdateFolder: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        store.update((state) => {
          const folder = state.folders.find((entry) => entry.id === dto.folderId);
          if (!folder) return state;
          const from = childPath(folder.path, folder.name);
          const to = childPath(folder.path, dto.name);
          const moved = <T extends { projectId: string; environment: string; path: string }>(
            entry: T
          ) =>
            entry.projectId === folder.projectId &&
            entry.environment === folder.environment &&
            within(entry.path, from)
              ? { ...entry, path: to + entry.path.slice(from.length) }
              : entry;
          return {
            ...state,
            folders: state.folders.map((entry) =>
              entry.id === folder.id
                ? { ...entry, name: dto.name, description: dto.description ?? "" }
                : moved(entry)
            ),
            imports: state.imports.map(moved),
            dynamicSecrets: state.dynamicSecrets.map(moved),
            secrets: state.secrets.map((secret) =>
              secret.projectId === folder.projectId &&
              secret.env === folder.environment &&
              within(secret.path, from)
                ? { ...secret, path: to + secret.path.slice(from.length) }
                : secret
            )
          };
        });
        return {};
      }
    };
  },
  useDeleteFolder: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async (dto) => {
        store.update((state) => {
          const folder = state.folders.find((entry) => entry.id === dto.folderId);
          if (!folder) return state;
          const root = childPath(folder.path, folder.name);
          const keep = (projectId: string, environment: string, path: string) =>
            projectId !== folder.projectId ||
            environment !== folder.environment ||
            !within(path, root);
          return {
            ...state,
            folders: state.folders.filter(
              (entry) =>
                entry.id !== folder.id && keep(entry.projectId, entry.environment, entry.path)
            ),
            imports: state.imports.filter((entry) =>
              keep(entry.projectId, entry.environment, entry.path)
            ),
            dynamicSecrets: state.dynamicSecrets.filter((entry) =>
              keep(entry.projectId, entry.environment, entry.path)
            ),
            secrets: state.secrets.filter((entry) => keep(entry.projectId, entry.env, entry.path))
          };
        });
        return {};
      }
    };
  },
  useApprovalRequests: ({
    projectId,
    status,
    environment,
    committer,
    search,
    offset = 0,
    limit = 20
  }) => {
    const needle = (search ?? "").trim().toLowerCase();
    const matched = useStore()
      .use()
      .approvals.filter(
        (request) =>
          request.project === projectId &&
          (!status || request.status === status) &&
          (!environment || request.environment === environment) &&
          (!committer || request.committerUserId === committer) &&
          (!needle ||
            request.secretPath.toLowerCase().includes(needle) ||
            request.commits.some((commit) => commit.secretKey.toLowerCase().includes(needle)))
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return {
      data: { approvals: matched.slice(offset, offset + limit), totalCount: matched.length },
      isPending: false,
      error: null
    };
  },
  useApprovalRequestCount: ({ projectId }) => {
    const requests = useStore()
      .use()
      .approvals.filter((request) => request.project === projectId);
    return {
      data: {
        open: requests.filter((request) => request.status === "open").length,
        closed: requests.filter((request) => request.status === "close").length
      },
      isPending: false,
      error: null
    };
  },
  useApprovalRequestDetails: ({ id }) => {
    const request = useStore()
      .use()
      .approvals.find((entry) => entry.id === id);
    return {
      data: request,
      isPending: false,
      error: request || !id ? null : new Error("Change request not found")
    };
  },
  useReviewApprovalRequest: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id, status, comment }) => {
        store.update((state) => ({
          ...state,
          approvals: state.approvals.map((request) =>
            request.id === id
              ? reviewed(request, {
                  reviewers: [
                    ...request.reviewers.filter((entry) => entry.userId !== DEMO_USER.userId),
                    {
                      ...DEMO_USER,
                      status,
                      comment: comment ?? "",
                      isOrgMembershipActive: true,
                      createdAt: new Date()
                    }
                  ]
                })
              : request
          )
        }));
        return {};
      }
    };
  },
  useUpdateApprovalRequestStatus: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id, status }) => {
        store.update((state) => ({
          ...state,
          approvals: state.approvals.map((request) =>
            request.id === id
              ? reviewed(request, { status, statusChangedByUserId: DEMO_USER.userId })
              : request
          )
        }));
        return {};
      }
    };
  },
  useMergeApprovalRequest: () => {
    const store = useStore();
    return {
      isPending: false,
      mutateAsync: async ({ id, bypassReason }) => {
        const request = store.get().approvals.find((entry) => entry.id === id);
        if (!request) return {};
        const timestamp = now();
        store.update((state) => {
          let { secrets } = state;
          request.commits.forEach((commit) => {
            const match = secretAt(
              request.project,
              request.environment,
              request.secretPath,
              commit.secretKey
            );
            if (commit.op === CommitType.DELETE) {
              secrets = secrets.filter((secret) => !match(secret));
              return;
            }
            const value = commit.secretValue ?? "";
            if (secrets.some(match)) {
              secrets = secrets.map((secret) =>
                match(secret)
                  ? { ...secret, value, version: secret.version + 1, updatedAt: timestamp }
                  : secret
              );
              return;
            }
            secrets = [
              ...secrets,
              {
                id: crypto.randomUUID(),
                projectId: request.project,
                env: request.environment,
                path: request.secretPath,
                key: commit.secretKey,
                value,
                secretValueHidden: false,
                version: 1,
                comment: "",
                tags: [],
                secretMetadata: [],
                createdAt: timestamp,
                updatedAt: timestamp
              }
            ];
          });
          return {
            ...state,
            secrets,
            approvals: state.approvals.map((entry) =>
              entry.id === id
                ? reviewed(entry, {
                    hasMerged: true,
                    status: "close",
                    bypassReason: bypassReason ?? null,
                    statusChangedByUserId: DEMO_USER.userId
                  })
                : entry
            )
          };
        });
        return {};
      }
    };
  }
};
