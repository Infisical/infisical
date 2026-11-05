import type { HoneyTokenManagedBy } from "@app/hooks/api/honeyTokens/enums";

export type ResourceApplyOptions = { shouldOverwrite?: boolean };

export type ResourceKind =
  | "folder"
  | "secret"
  | "import"
  | "dynamic"
  | "rotation"
  | "honey"
  | "proxy";
export type ValueState =
  | { status: "present"; value: string }
  | { status: "unreadable" | "loading" }
  | { status: "failed"; message: string };
export type Scope = { project: string; environment: string; path: string };
export type SecretReminder = {
  id?: string;
  repeatDays?: number;
  fromDate?: string;
  nextReminderDate?: string;
  message: string;
  recipients: string[];
};
export type SecretVersion = {
  id?: string;
  version: number;
  value: string;
  createdAt: string;
  actor: string;
  actorType: "user" | "identity" | "platform";
  redacted?: boolean;
};
type ResourceBase = Scope & { id: string; name: string; createdAt: string; updatedAt: string };
export type Secret = ResourceBase & {
  kind: "secret";
  value: ValueState;
  comment: string;
  tags: string[];
  metadata: { key: string; value: string; encrypted: boolean }[];
  version: number;
  override?: string;
  managedBy?: string;
  honeyToken?: boolean;
  reminder?: SecretReminder;
  skipMultilineEncoding?: boolean;
  versions?: SecretVersion[];
};
export type Resource =
  | Secret
  | (ResourceBase & { kind: "folder"; description: string })
  | (ResourceBase & {
      kind: "import";
      source: Scope;
      revoked: boolean;
      replicated: boolean;
      replicationStatus?: "succeeded" | "failed";
      replicationDetails?: string;
      lastReplicated?: string;
    })
  | (ResourceBase & {
      kind: "dynamic";
      provider: string;
      defaultTTL: string;
      maxTTL?: string;
      status?: "failed-deletion" | "deleting";
      statusDetails?: string;
      config?: {
        type: string;
        inputs: unknown;
        usernameTemplate?: string | null;
        metadata?: { key: string; value: string }[];
      };
    })
  | (ResourceBase & {
      kind: "rotation";
      provider: string;
      connection: string;
      connectionId?: string;
      status: "success" | "failed";
      statusDetails?: string;
      autoRotation: boolean;
      description?: string;
      lastRotatedAt: string;
      nextRotationAt?: string;
      managedKeys: string[];
      type?: string;
      rotationInterval?: number;
      rotateAtUtc?: { hours: number; minutes: number };
      parameters?: Record<string, unknown>;
      secretsMapping?: Record<string, string>;
      generatedCredentials?: Record<string, string>[];
      activeIndex?: number;
    })
  | (ResourceBase & {
      kind: "honey";
      provider: string;
      managedBy?: HoneyTokenManagedBy;
      status: "active" | "triggered" | "revoked";
      description: string;
      mappedKeys: string[];
      events?: {
        id: string;
        createdAt: string;
        eventName?: string;
        awsRegion?: string;
        sourceIp?: string;
        userAgent?: string;
      }[];
    })
  | (ResourceBase & {
      kind: "proxy";
      host: string;
      enabled: boolean;
      lastUsedAt?: string;
      credentials?: {
        role: string;
        secretKey?: string;
        dynamicSecretName?: string;
        dynamicSecretField?: string;
        headerName?: string;
        headerPrefix?: string;
        headerPurpose?: string;
        placeholderKey?: string;
        placeholderValue?: string;
        substitutionSurfaces?: string[];
      }[];
    });
export const environments: { value: string; label: string }[] = [];
export const setEnvironmentOptions = (options: readonly { value: string; label: string }[]) => {
  environments.splice(0, environments.length, ...options);
};
export const resourceKinds: { value: ResourceKind; label: string }[] = [
  { value: "folder", label: "Folders" },
  { value: "secret", label: "Secrets" },
  { value: "import", label: "Imports" },
  { value: "dynamic", label: "Dynamic secrets" },
  { value: "rotation", label: "Secret rotations" },
  { value: "honey", label: "Honey tokens" },
  { value: "proxy", label: "Proxied services" }
];
export const scopeMatches = (resource: Scope, scope: Scope) =>
  resource.project === scope.project &&
  resource.environment === scope.environment &&
  resource.path === scope.path;
export const resourceKey = (resource: Pick<Resource, "kind" | "name">) =>
  `${resource.kind}:${resource.name}`;
export const readableValue = (secret: Secret) =>
  secret.value.status === "present" ? secret.value.value : undefined;
export const versionsOf = (secret: Secret): SecretVersion[] => secret.versions ?? [];
