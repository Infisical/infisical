import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TGenericPermission = {
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string | undefined;
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

export type PickRequired<T> = Pick<T, RequiredKeys<T>>;

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
