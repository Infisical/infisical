import { HONEY_TOKEN_MAP } from "@app/helpers/honeyTokens";
import { SECRET_ROTATION_MAP } from "@app/helpers/secretRotationsV2";
import type { DashboardProjectSecretsOverview } from "@app/hooks/api/dashboard/types";
import { DynamicSecretStatus } from "@app/hooks/api/dynamicSecret/types";
import { HoneyTokenStatus } from "@app/hooks/api/honeyTokens/enums";
import type { TProjectEnvironmentsFolders } from "@app/hooks/api/secretFolders/types";
import { SecretRotationStatus } from "@app/hooks/api/secretRotationsV2/enums";
import type { SecretV3RawSanitized } from "@app/hooks/api/secrets/types";

import type { Resource, Secret, ValueState } from "../secrets-model";

export type ScopeSecrets = { environment: string; path: string; secrets: SecretV3RawSanitized[] };

export const valueKey = (
  environment: string,
  path: string,
  key: string,
  isOverride = false,
  version = 0
) => [environment, path, key, isOverride ? "override" : `v${version}`].join("\u0000");

export type LoadedValues = Record<string, string | { error: string }>;

const parent = (path: string) => {
  const segments = path.split("/").filter(Boolean);
  return `/${segments.slice(0, -1).join("/")}`;
};

export const providerLabel = (type: string) => {
  if (type === "sql-database") return "SQL Database";
  return type
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
};
const replicationOf = (replicated?: boolean, success?: boolean) => {
  if (!replicated) return undefined;
  return success === false ? ("failed" as const) : ("succeeded" as const);
};
const dynamicStatusOf = (status?: DynamicSecretStatus) => {
  if (status === DynamicSecretStatus.FailedDeletion) return "failed-deletion" as const;
  if (status === DynamicSecretStatus.Deleting) return "deleting" as const;
  return undefined;
};
const honeyStatusOf = (status: HoneyTokenStatus) => {
  if (status === HoneyTokenStatus.Triggered) return "triggered" as const;
  if (status === HoneyTokenStatus.Revoked) return "revoked" as const;
  return "active" as const;
};

const valueOf = (
  secret: SecretV3RawSanitized,
  environment: string,
  path: string,
  values: LoadedValues
): ValueState => {
  if (secret.secretValueHidden) return { status: "unreadable" };
  if (secret.value !== undefined) return { status: "present", value: secret.value };
  if (secret.isEmpty) return { status: "present", value: "" };
  const loaded = values[valueKey(environment, path, secret.key, false, secret.version)];
  if (typeof loaded === "string") return { status: "present", value: loaded };
  if (loaded) return { status: "failed", message: loaded.error };
  return { status: "loading" };
};

const isoOf = (date?: Date | string | null) => (date ? new Date(date).toISOString() : undefined);
const overrideOf = (secret: SecretV3RawSanitized, loaded: LoadedValues[string] | undefined) => {
  if (!secret.idOverride) return undefined;
  return typeof loaded === "string" ? loaded : "";
};
const reminderOf = (secret: SecretV3RawSanitized) => {
  if (!secret.reminder && !secret.reminderRepeatDays && !secret.reminderNote) return undefined;
  return {
    id: secret.reminder?.id,
    repeatDays: secret.reminder?.repeatDays ?? secret.reminderRepeatDays ?? undefined,
    fromDate: isoOf(secret.reminder?.fromDate),
    nextReminderDate: isoOf(secret.reminder?.nextReminderDate),
    message: secret.reminder?.message ?? secret.reminderNote ?? "",
    recipients: secret.reminder?.recipients ?? secret.reminderRecipients ?? []
  };
};

export const toSecretResource = (
  projectId: string,
  environment: string,
  path: string,
  secret: SecretV3RawSanitized,
  values: LoadedValues,
  rotationNames: Record<string, string>
): Secret => {
  const override = values[valueKey(environment, path, secret.key, true)];
  return {
    kind: "secret",
    id: secret.id,
    project: projectId,
    environment,
    path,
    name: secret.key,
    value: valueOf(secret, environment, path, values),
    comment: secret.comment ?? "",
    tags: (secret.tags ?? []).map((tag) => tag.slug),
    metadata: (secret.secretMetadata ?? []).map((entry) => ({
      key: entry.key,
      value: entry.value,
      encrypted: Boolean(entry.isEncrypted)
    })),
    version: secret.version,
    override: overrideOf(secret, override),
    managedBy: secret.isRotatedSecret
      ? (rotationNames[secret.rotationId ?? ""] ?? "secret rotation")
      : undefined,
    honeyToken: secret.isHoneyTokenSecret || undefined,
    reminder: reminderOf(secret),
    skipMultilineEncoding: secret.skipMultilineEncoding ?? undefined,
    createdAt: secret.createdAt,
    updatedAt: secret.updatedAt
  };
};

export const buildResources = ({
  projectId,
  path,
  overview,
  folderTree,
  scopes,
  values
}: {
  projectId: string;
  path: string;
  overview?: DashboardProjectSecretsOverview;
  folderTree?: TProjectEnvironmentsFolders;
  scopes: ScopeSecrets[];
  values: LoadedValues;
}): Resource[] => {
  const resources: Resource[] = [];
  const seen = new Set<string>();
  const push = (resource: Resource) => {
    const id = `${resource.kind}:${resource.id}`;
    if (seen.has(id)) return;
    seen.add(id);
    resources.push(resource);
  };
  const at = (environment: string, scopePath = path) => ({
    project: projectId,
    environment,
    path: scopePath,
    createdAt: "",
    updatedAt: ""
  });
  const rotationNames = Object.fromEntries(
    (overview?.secretRotations ?? []).map((rotation) => [rotation.id, rotation.name])
  );

  (overview?.imports ?? []).forEach((entry) =>
    push({
      ...at(entry.environment ?? ""),
      kind: "import",
      id: entry.id,
      name: `${entry.importEnv.slug}:${entry.importPath}`,
      source: {
        project: entry.importEnv.projectId ?? projectId,
        environment: entry.importEnv.slug,
        path: entry.importPath
      },
      revoked: Boolean(entry.isAccessRevoked),
      replicated: Boolean(entry.isReplication),
      replicationStatus: replicationOf(entry.isReplication, entry.isReplicationSuccess),
      replicationDetails: entry.replicationStatus,
      lastReplicated: entry.lastReplicated,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })
  );
  (overview?.folders ?? []).forEach((entry) =>
    push({
      ...at(entry.environment),
      kind: "folder",
      id: entry.id,
      name: entry.name,
      description: entry.description ?? ""
    })
  );
  Object.values(folderTree ?? {}).forEach((environment) =>
    environment.folders
      .filter((folder) => folder.path !== "/")
      .forEach((folder) =>
        push({
          ...at(environment.slug, parent(folder.path)),
          kind: "folder",
          id: folder.id,
          name: folder.name,
          description: folder.description ?? ""
        })
      )
  );
  (overview?.dynamicSecrets ?? []).forEach((entry) =>
    push({
      ...at(entry.environment),
      kind: "dynamic",
      id: entry.id,
      name: entry.name,
      provider: providerLabel(entry.type),
      defaultTTL: entry.defaultTTL,
      maxTTL: entry.maxTTL,
      status: dynamicStatusOf(entry.status),
      statusDetails: entry.statusDetails ?? undefined,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })
  );
  (overview?.secretRotations ?? []).forEach((entry) =>
    push({
      ...at(entry.environment.slug),
      kind: "rotation",
      id: entry.id,
      name: entry.name,
      provider: SECRET_ROTATION_MAP[entry.type]?.name ?? entry.type,
      connection: entry.connection.name,
      connectionId: entry.connection.id,
      status: entry.rotationStatus === SecretRotationStatus.Failed ? "failed" : "success",
      statusDetails: entry.lastRotationMessage ?? undefined,
      autoRotation: entry.isAutoRotationEnabled,
      description: entry.description ?? undefined,
      lastRotatedAt: entry.lastRotatedAt,
      nextRotationAt: entry.nextRotationAt ?? undefined,
      managedKeys: Object.values(entry.secretsMapping as Record<string, string>),
      type: entry.type,
      rotationInterval: entry.rotationInterval,
      rotateAtUtc: entry.rotateAtUtc,
      parameters: entry.parameters as Record<string, unknown>,
      secretsMapping: entry.secretsMapping as Record<string, string>,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })
  );
  (overview?.honeyTokens ?? []).forEach((entry) =>
    push({
      ...at(entry.environment.slug),
      kind: "honey",
      id: entry.id,
      name: entry.name,
      provider: HONEY_TOKEN_MAP[entry.type]?.name ?? entry.type,
      managedBy: entry.config?.managedBy,
      status: honeyStatusOf(entry.status),
      description: entry.description ?? "",
      mappedKeys: Object.values(entry.secretsMapping),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })
  );
  (overview?.proxiedServices ?? []).forEach((entry) =>
    push({
      ...at(entry.environment.slug),
      kind: "proxy",
      id: entry.id,
      name: entry.name,
      host: entry.hostPattern,
      enabled: entry.isEnabled,
      lastUsedAt: entry.lastUsedAt ?? undefined,
      credentials: entry.credentials.map((credential) => ({
        role: credential.role,
        secretKey: credential.secretKey ?? undefined,
        dynamicSecretName: credential.dynamicSecretName ?? undefined,
        dynamicSecretField: credential.dynamicSecretField ?? undefined,
        headerName: credential.headerName ?? undefined,
        headerPrefix: credential.headerPrefix ?? undefined,
        headerPurpose: credential.headerPurpose ?? undefined,
        placeholderKey: credential.placeholderKey ?? undefined,
        placeholderValue: credential.placeholderValue ?? undefined,
        substitutionSurfaces: credential.substitutionSurfaces ?? undefined
      })),
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt
    })
  );
  (overview?.secrets ?? []).forEach((secret) =>
    push(toSecretResource(projectId, secret.env, path, secret, values, rotationNames))
  );
  scopes.forEach((scope) =>
    scope.secrets.forEach((secret) =>
      push(
        toSecretResource(projectId, scope.environment, scope.path, secret, values, rotationNames)
      )
    )
  );
  return resources;
};
