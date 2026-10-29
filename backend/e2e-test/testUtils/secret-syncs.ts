import { SecretSyncInitialSyncBehavior } from "@app/services/secret-sync/secret-sync-enums";

const DESTINATION = "aws-parameter-store";

type TSecretSyncRecord = {
  id: string;
  name: string;
  syncOptions: {
    initialSyncBehavior: string;
    includeAllSubFolders?: boolean;
    keySchema?: string;
    disableSecretDeletion?: boolean;
  };
  syncStatus: string | null;
  importStatus: string | null;
  removeStatus: string | null;
  lastSyncMessage: string | null;
  lastImportMessage: string | null;
  lastRemoveMessage: string | null;
  lastSyncedAt: string | null;
};

// Auto sync defaults to off, so creating a sync starts no run and reaches no destination.
export const createSecretSync = async (dto: {
  name: string;
  projectId: string;
  connectionId: string;
  environmentSlug: string;
  secretPath: string;
  region: string;
  destinationPath: string;
  initialSyncBehavior?: SecretSyncInitialSyncBehavior;
  keySchema?: string;
  disableSecretDeletion?: boolean;
  includeAllSubFolders?: boolean;
  isAutoSyncEnabled?: boolean;
  authToken: string;
  expectStatusCode?: number;
}) => {
  const res = await testServer.inject({
    method: "POST",
    url: `/api/v1/secret-syncs/${DESTINATION}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: {
      name: dto.name,
      projectId: dto.projectId,
      connectionId: dto.connectionId,
      environment: dto.environmentSlug,
      secretPath: dto.secretPath,
      isAutoSyncEnabled: dto.isAutoSyncEnabled ?? false,
      syncOptions: {
        initialSyncBehavior: dto.initialSyncBehavior ?? SecretSyncInitialSyncBehavior.OverwriteDestination,
        ...(dto.keySchema ? { keySchema: dto.keySchema } : {}),
        ...(dto.disableSecretDeletion === undefined ? {} : { disableSecretDeletion: dto.disableSecretDeletion }),
        ...(dto.includeAllSubFolders === undefined ? {} : { includeAllSubFolders: dto.includeAllSubFolders })
      },
      destinationConfig: { region: dto.region, path: dto.destinationPath }
    }
  });

  expect(res.statusCode).toBe(dto.expectStatusCode ?? 200);

  // A spec asserting a rejection wants the body, not an id.
  if ((dto.expectStatusCode ?? 200) !== 200) return { error: res.json() };

  return { secretSync: res.json().secretSync as TSecretSyncRecord };
};

export const deleteSecretSync = async (dto: { syncId: string; authToken: string }) => {
  const res = await testServer.inject({
    method: "DELETE",
    url: `/api/v1/secret-syncs/${DESTINATION}/${dto.syncId}`,
    headers: { authorization: `Bearer ${dto.authToken}` },
    body: { removeSecrets: false }
  });

  expect(res.statusCode).toBe(200);
};
