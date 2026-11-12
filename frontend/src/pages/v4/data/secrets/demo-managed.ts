import { SECRET_SYNC_MAP } from "@app/helpers/secretSyncs";
import { HoneyTokenManagedBy, HoneyTokenStatus } from "@app/hooks/api/honeyTokens/enums";
import { SecretRotationStatus } from "@app/hooks/api/secretRotationsV2/enums";
import type {
  TSecretRotationV2,
  TViewSecretRotationGeneratedCredentialsResponse
} from "@app/hooks/api/secretRotationsV2/types";
import { SecretSync, SecretSyncStatus } from "@app/hooks/api/secretSyncs/enums";
import type { TSecretSync } from "@app/hooks/api/secretSyncs/types";

import { IMPORT_CAPABLE_SYNCS } from "../../secret-manager/OverviewPage/secrets/secret-sync/sync-model";
import type { SecretsManagedAdapter } from "./contract-managed";
import { DEMO_ROTATION_CONNECTIONS, secretsOptionsDemo } from "./demo-options";
import {
  demoMutation,
  type DemoStore,
  now,
  recordVersion,
  updateSecrets,
  useStore
} from "./demo-store";
import { syncAutomationDemo } from "./demo-sync-automation";
import { syncCloudDemo } from "./demo-sync-cloud";
import { syncDataDemo } from "./demo-sync-data";
import { syncDeployDemo } from "./demo-sync-deploy";
import { syncGitDemo } from "./demo-sync-git";
import { syncHostingDemo } from "./demo-sync-hosting";
import { syncVaultsDemo } from "./demo-sync-vaults";
import { DEMO_SYNC_CONNECTIONS, demoSync } from "./demo-syncs";
import { type DemoSecret, envOf } from "./fixtures";

const patchSync = (store: DemoStore, syncId: string, patch: Partial<TSecretSync>) =>
  store.update((state) => ({
    ...state,
    secretSyncs: state.secretSyncs.map((sync) =>
      sync.id === syncId ? ({ ...sync, ...patch } as TSecretSync) : sync
    )
  }));

const fakeValue = (key: string) =>
  `fake-${key.toLowerCase().replace(/_/g, "-")}-${crypto.randomUUID().slice(0, 8)}`;

const scopedSecret = (
  scope: { projectId: string; environment: string; path: string },
  key: string,
  value: string
): DemoSecret => {
  const timestamp = now();
  return {
    id: crypto.randomUUID(),
    projectId: scope.projectId,
    env: scope.environment,
    path: scope.path,
    key,
    value,
    isEmpty: false,
    secretValueHidden: false,
    version: 1,
    comment: "",
    tags: [],
    secretMetadata: [],
    createdAt: timestamp,
    updatedAt: timestamp
  };
};

const rotationById = (store: DemoStore, rotationId: string) => {
  const rotation = store.get().rotations.find((entry) => entry.id === rotationId);
  if (!rotation) throw new Error("Secret rotation not found");
  return rotation;
};

const inScope =
  (
    entry: { projectId: string; environment: { slug: string }; folder: { path: string } },
    keys: string[]
  ) =>
  (secret: DemoSecret) =>
    secret.projectId === entry.projectId &&
    secret.env === entry.environment.slug &&
    secret.path === entry.folder.path &&
    keys.includes(secret.key);

const renameMapped = (
  store: DemoStore,
  entry: { projectId: string; environment: { slug: string }; folder: { path: string } },
  before: Record<string, string>,
  after: Record<string, string>
) =>
  updateSecrets(store, inScope(entry, Object.values(before)), (secret) => {
    const field = Object.keys(before).find((key) => before[key] === secret.key);
    return { ...secret, key: (field && after[field]) || secret.key };
  });

const valuesOf = (store: DemoStore, rotation: TSecretRotationV2) => {
  const { secrets } = store.get();
  return Object.fromEntries(
    Object.entries(rotation.secretsMapping as Record<string, string>).map(([field, key]) => [
      field,
      secrets.find(inScope(rotation, [key]))?.value ?? ""
    ])
  );
};

export const secretsManagedDemo: SecretsManagedAdapter = {
  ...secretsOptionsDemo,
  ...syncCloudDemo,
  ...syncDataDemo,
  ...syncVaultsDemo,
  ...syncGitDemo,
  ...syncDeployDemo,
  ...syncHostingDemo,
  ...syncAutomationDemo,
  useSecretRotationCredentials: ({ rotationId }, options) => {
    const store = useStore();
    const state = store.use();
    const rotation = state.rotations.find((entry) => entry.id === rotationId);
    if (!rotation || options?.enabled === false)
      return { data: undefined, isPending: true, error: null };
    const history = (rotation as TSecretRotationV2 & { retired?: Record<string, string> }).retired;
    return {
      data: {
        activeIndex: 0,
        generatedCredentials: [valuesOf(store, rotation), history],
        type: rotation.type,
        rotationId
      } as unknown as TViewSecretRotationGeneratedCredentialsResponse,
      isPending: false,
      error: null
    };
  },
  useCreateSecretRotation: demoMutation((store, dto) => {
    const timestamp = now();
    const mapping = dto.secretsMapping as Record<string, string>;
    const parameters = dto.parameters as Record<string, unknown>;
    const rotation = {
      id: crypto.randomUUID(),
      name: dto.name,
      description: dto.description ?? null,
      type: dto.type,
      folderId: `${dto.projectId}:${dto.environment}:${dto.secretPath}`,
      connectionId: dto.connectionId,
      connection: DEMO_ROTATION_CONNECTIONS.find((entry) => entry.id === dto.connectionId) ?? {
        app: "",
        id: dto.connectionId,
        name: dto.connectionId
      },
      createdAt: timestamp,
      updatedAt: timestamp,
      rotationInterval: dto.rotationInterval,
      rotateAtUtc: dto.rotateAtUtc,
      projectId: dto.projectId,
      rotationStatus: SecretRotationStatus.Success,
      lastRotationJobId: null,
      lastRotatedAt: timestamp,
      lastRotationAttemptedAt: timestamp,
      lastRotationMessage: null,
      environment: envOf(dto.environment),
      folder: { id: dto.secretPath, path: dto.secretPath },
      isAutoRotationEnabled: dto.isAutoRotationEnabled,
      nextRotationAt: null,
      parameters,
      secretsMapping: mapping,
      secrets: []
    } as unknown as TSecretRotationV2;
    const scope = { projectId: dto.projectId, environment: dto.environment, path: dto.secretPath };
    store.update((state) => ({
      ...state,
      rotations: [...state.rotations, rotation],
      secrets: [
        ...state.secrets,
        ...Object.entries(mapping).map(([field, key]) => {
          const configured =
            parameters[field] ?? (field === "username" ? parameters.username1 : "");
          return scopedSecret(
            scope,
            key,
            typeof configured === "string" && configured ? configured : fakeValue(key)
          );
        })
      ]
    }));
    return {};
  }),
  useUpdateSecretRotation: demoMutation((store, { rotationId, type: _type, ...dto }) => {
    const rotation = rotationById(store, rotationId);
    if (dto.secretsMapping)
      renameMapped(
        store,
        rotation,
        rotation.secretsMapping as Record<string, string>,
        dto.secretsMapping as Record<string, string>
      );
    store.update((state) => ({
      ...state,
      rotations: state.rotations.map((entry) =>
        entry.id === rotationId
          ? ({
              ...entry,
              ...Object.fromEntries(
                Object.entries(dto).filter(
                  ([key, value]) =>
                    value !== undefined && !["projectId", "secretPath"].includes(key)
                )
              ),
              updatedAt: now()
            } as TSecretRotationV2)
          : entry
      )
    }));
    return {};
  }),
  useRotateSecretRotation: demoMutation((store, { rotationId }) => {
    const rotation = rotationById(store, rotationId);
    const mapping = rotation.secretsMapping as Record<string, string>;
    const parameters = rotation.parameters as Record<string, unknown>;
    const retired = valuesOf(store, rotation);
    const timestamp = now();
    store
      .get()
      .secrets.filter(inScope(rotation, Object.values(mapping)))
      .forEach((secret) => recordVersion(store, secret));
    updateSecrets(store, inScope(rotation, Object.values(mapping)), (secret) => {
      const field = Object.keys(mapping).find((key) => mapping[key] === secret.key);
      const { username1, username2 } = parameters;
      const value =
        field === "username" && typeof username1 === "string" && typeof username2 === "string"
          ? ([username1, username2].find((name) => name !== secret.value) ?? username1)
          : fakeValue(secret.key);
      return { ...secret, value, version: secret.version + 1, updatedAt: timestamp };
    });
    store
      .get()
      .secrets.filter(inScope(rotation, Object.values(mapping)))
      .forEach((secret) => recordVersion(store, secret));
    store.update((state) => ({
      ...state,
      rotations: state.rotations.map((entry) =>
        entry.id === rotationId
          ? ({
              ...entry,
              ...{ retired },
              rotationStatus: SecretRotationStatus.Success,
              lastRotatedAt: timestamp,
              lastRotationAttemptedAt: timestamp,
              updatedAt: timestamp
            } as TSecretRotationV2)
          : entry
      )
    }));
    return {};
  }),
  useDeleteSecretRotation: demoMutation((store, { rotationId, deleteSecrets }) => {
    const rotation = rotationById(store, rotationId);
    if (deleteSecrets)
      updateSecrets(
        store,
        inScope(rotation, Object.values(rotation.secretsMapping as Record<string, string>)),
        () => null
      );
    store.update((state) => ({
      ...state,
      rotations: state.rotations.filter((entry) => entry.id !== rotationId)
    }));
    return {};
  }),
  useReconcileSecretRotation: demoMutation((store, { rotationId }) => ({
    message: "The stored password already matches the account, so nothing was changed.",
    reconciled: false,
    secretRotation: rotationById(store, rotationId) as never
  })),
  useCheckSecretRotationCredentials: demoMutation((store, { rotationId }) => {
    rotationById(store, rotationId);
    return {};
  }),
  useHoneyTokenCredentials: ({ honeyTokenId, enabled }) => {
    const state = useStore().use();
    const token = state.honeyTokens.find((entry) => entry.id === honeyTokenId);
    if (!token || enabled === false) return { data: undefined, isPending: true, error: null };
    return {
      data: Object.fromEntries(
        Object.entries(token.secretsMapping).map(([field, key]) => [
          field,
          state.secrets.find(inScope(token, [key]))?.value ?? ""
        ])
      ),
      isPending: false,
      error: null
    };
  },
  useHoneyTokenDeploymentOptions: () => ({
    data: [
      { managedBy: HoneyTokenManagedBy.Instance, unavailableReason: null },
      { managedBy: HoneyTokenManagedBy.Organization, unavailableReason: null }
    ],
    isPending: false,
    error: null,
    refetch: () => undefined
  }),
  useCreateHoneyToken: demoMutation((store, dto) => {
    const timestamp = now();
    const honeyToken = {
      id: crypto.randomUUID(),
      name: dto.name,
      description: dto.description ?? null,
      status: HoneyTokenStatus.Active,
      projectId: dto.projectId,
      folderId: `${dto.projectId}:${dto.environment}:${dto.secretPath}`,
      createdAt: timestamp,
      updatedAt: timestamp,
      type: dto.type,
      config: dto.config,
      secretsMapping: dto.secretsMapping,
      environment: envOf(dto.environment),
      folder: { path: dto.secretPath }
    };
    const scope = { projectId: dto.projectId, environment: dto.environment, path: dto.secretPath };
    store.update((state) => ({
      ...state,
      honeyTokens: [...state.honeyTokens, honeyToken as (typeof state.honeyTokens)[number]],
      secrets: [
        ...state.secrets,
        ...Object.values(dto.secretsMapping).map((key) =>
          scopedSecret(scope, key, fakeValue(`decoy-${key}`))
        )
      ]
    }));
    return { honeyToken: honeyToken as never };
  }),
  useUpdateHoneyToken: demoMutation((store, { honeyTokenId, projectId: _projectId, ...dto }) => {
    const token = store.get().honeyTokens.find((entry) => entry.id === honeyTokenId);
    if (!token) throw new Error("Honey token not found");
    if (dto.secretsMapping) renameMapped(store, token, token.secretsMapping, dto.secretsMapping);
    store.update((state) => ({
      ...state,
      honeyTokens: state.honeyTokens.map((entry) =>
        entry.id === honeyTokenId
          ? ({
              ...entry,
              name: dto.name ?? entry.name,
              description: dto.description === undefined ? entry.description : dto.description,
              secretsMapping: dto.secretsMapping ?? entry.secretsMapping,
              updatedAt: now()
            } as typeof entry)
          : entry
      )
    }));
    return {};
  }),
  useResetHoneyToken: demoMutation((store, { honeyTokenId }) => {
    store.update((state) => ({
      ...state,
      honeyTokens: state.honeyTokens.map((entry) =>
        entry.id === honeyTokenId
          ? ({ ...entry, status: HoneyTokenStatus.Active, updatedAt: now() } as typeof entry)
          : entry
      )
    }));
    return {};
  }),
  useRevokeHoneyToken: demoMutation((store, { honeyTokenId }) => {
    const token = store.get().honeyTokens.find((entry) => entry.id === honeyTokenId);
    if (!token) throw new Error("Honey token not found");
    updateSecrets(store, inScope(token, Object.values(token.secretsMapping)), () => null);
    store.update((state) => ({
      ...state,
      honeyTokens: state.honeyTokens.map((entry) =>
        entry.id === honeyTokenId
          ? ({ ...entry, status: HoneyTokenStatus.Revoked, updatedAt: now() } as typeof entry)
          : entry
      )
    }));
    return {};
  }),
  useUpdateProxiedService: demoMutation((store, { serviceId, credentials, ...dto }) => {
    store.update((state) => ({
      ...state,
      proxiedServices: state.proxiedServices.map((entry) =>
        entry.id === serviceId
          ? {
              ...entry,
              name: dto.name ?? entry.name,
              hostPattern: dto.hostPattern ?? entry.hostPattern,
              isEnabled: dto.isEnabled ?? entry.isEnabled,
              credentials: credentials
                ? credentials.map((credential, index) => ({
                    ...credential,
                    id: `${serviceId}-credential-${index}`,
                    serviceId
                  }))
                : entry.credentials,
              updatedAt: now()
            }
          : entry
      )
    }));
    return {};
  }),
  useDeleteProxiedService: demoMutation((store, { serviceId }) => {
    store.update((state) => ({
      ...state,
      proxiedServices: state.proxiedServices.filter((entry) => entry.id !== serviceId)
    }));
    return {};
  }),
  useSecretSyncs: (projectId) => {
    const state = useStore().use();
    return {
      data: state.secretSyncs.filter((sync) => sync.projectId === projectId),
      isPending: false,
      error: null
    };
  },
  useSecretSync: (_destination, syncId) => {
    const state = useStore().use();
    return {
      data: state.secretSyncs.find((sync) => sync.id === syncId),
      isPending: false,
      error: null
    };
  },
  useSecretSyncOptions: () => ({
    data: (Object.keys(SECRET_SYNC_MAP) as SecretSync[]).map((destination) => ({
      name: SECRET_SYNC_MAP[destination].name,
      destination,
      canImportSecrets: IMPORT_CAPABLE_SYNCS.includes(destination),
      canRemoveSecretsOnDeletion: true
    })),
    isPending: false,
    error: null
  }),
  useSecretSyncDuplicate: () => ({
    data: { hasDuplicate: false },
    isPending: false,
    error: null
  }),
  useUpdateSecretSync: demoMutation((store, { syncId, projectId: _projectId, ...dto }) => {
    const current = store.get().secretSyncs.find((sync) => sync.id === syncId);
    if (!current) throw new Error("Secret sync not found");
    if (
      dto.name &&
      store.get().secretSyncs.some((sync) => sync.id !== syncId && sync.name === dto.name)
    )
      throw new Error(`A secret sync with the name "${dto.name}" already exists in this project.`);
    const connection = DEMO_SYNC_CONNECTIONS.find((entry) => entry.id === dto.connectionId);
    const next = {
      ...current,
      ...(dto.name !== undefined && { name: dto.name }),
      ...(dto.description !== undefined && { description: dto.description }),
      ...(dto.isAutoSyncEnabled !== undefined && { isAutoSyncEnabled: dto.isAutoSyncEnabled }),
      ...(dto.includeAllSubFolders !== undefined && {
        includeAllSubFolders: dto.includeAllSubFolders
      }),
      ...(dto.environment && { environment: envOf(dto.environment) }),
      ...(dto.secretPath && { folder: { id: dto.secretPath, path: dto.secretPath } }),
      ...(dto.syncOptions && { syncOptions: dto.syncOptions }),
      ...(dto.destinationConfig && { destinationConfig: dto.destinationConfig }),
      ...(connection && {
        connectionId: connection.id,
        connection: { app: connection.app, id: connection.id, name: connection.name }
      }),
      updatedAt: now()
    } as TSecretSync;
    store.update((state) => ({
      ...state,
      secretSyncs: state.secretSyncs.map((sync) => (sync.id === syncId ? next : sync))
    }));
    return next;
  }),
  useDeleteSecretSync: demoMutation((store, { syncId }) => {
    store.update((state) => ({
      ...state,
      secretSyncs: state.secretSyncs.filter((sync) => sync.id !== syncId)
    }));
    return {};
  }),
  useTriggerSecretSync: demoMutation((store, { syncId }) => {
    patchSync(store, syncId, {
      syncStatus: SecretSyncStatus.Succeeded,
      lastSyncedAt: new Date(),
      lastSyncMessage: null
    });
    return {};
  }),
  useImportSecretSyncSecrets: demoMutation((store, { syncId }) => {
    patchSync(store, syncId, {
      importStatus: SecretSyncStatus.Succeeded,
      lastImportedAt: new Date(),
      lastImportMessage: null
    });
    return {};
  }),
  useRemoveSecretSyncSecrets: demoMutation((store, { syncId }) => {
    patchSync(store, syncId, {
      removeStatus: SecretSyncStatus.Succeeded,
      lastRemovedAt: new Date(),
      lastRemoveMessage: null
    });
    return {};
  }),
  useCreateSecretSync: demoMutation((store, dto) => {
    if (store.get().secretSyncs.some((sync) => sync.name === dto.name))
      throw new Error(`A secret sync with the name "${dto.name}" already exists in this project.`);
    const sync = {
      ...demoSync({
        name: dto.name,
        description: dto.description,
        destination: dto.destination,
        connectionId: dto.connectionId,
        environment: envOf(dto.environment),
        path: dto.secretPath,
        status: null,
        isAutoSyncEnabled: Boolean(dto.isAutoSyncEnabled),
        destinationConfig: dto.destinationConfig,
        syncOptions: dto.syncOptions
      }),
      projectId: dto.projectId
    };
    store.update((state) => ({ ...state, secretSyncs: [...state.secretSyncs, sync] }));
    return {};
  }),
  useSyncConnections: (app) => ({
    data: DEMO_SYNC_CONNECTIONS.filter((connection) => connection.app === app),
    isPending: false,
    error: null
  })
};
