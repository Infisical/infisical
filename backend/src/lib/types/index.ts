import { TDynamicSecrets } from "@app/db/schemas/dynamic-secrets";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TGenericPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

/**
 * TODO(dangtony98): ideally move service fns to use TGenericPermission
 * because TOrgPermission [orgId] is not as relevant anymore with the
 * introduction of organizationIds bound to all user tokens
 */
export type TOrgPermission = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

export type TProjectPermission = {
  actor: ActorType;
  actorId: string;
  projectId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

// same as TProjectPermission but with projectSlug requirement instead of projectId
export type TProjectSlugPermission = {
  actor: ActorType;
  actorId: string;
  projectSlug: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

export type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

export type BufferKeysToString<T> = {
  [K in keyof T]: T[K] extends Buffer
    ? string
    : T[K] extends Buffer | null
      ? string | null
      : T[K] extends Buffer | undefined
        ? string | undefined
        : T[K] extends Buffer | null | undefined
          ? string | null | undefined
          : T[K];
};

export type PickRequired<T> = Pick<T, RequiredKeys<T>>;

export type DiscriminativePick<T, K extends keyof T> = T extends unknown ? Pick<T, K> : never;

export enum EnforcementLevel {
  Hard = "hard",
  Soft = "soft"
}

export enum SecretSharingAccessType {
  Anyone = "anyone",
  Organization = "organization"
}

export enum OrderByDirection {
  ASC = "asc",
  DESC = "desc"
}

export type OrgServiceActor = {
  type: ActorType;
  id: string;
  authMethod: ActorAuthMethod;
  orgId: string;
  rootOrgId: string;
  parentOrgId: string;
};

export type ProjectServiceActor = {
  type: ActorType;
  id: string;
  authMethod: ActorAuthMethod;
  orgId: string;
};

export enum QueueWorkerProfile {
  All = "all",
  Standard = "standard",
  SecretScanning = "secret-scanning"
}

export interface TDynamicSecretWithMetadata extends TDynamicSecrets {
  metadata: { id: string; key: string; value: string }[];
}
