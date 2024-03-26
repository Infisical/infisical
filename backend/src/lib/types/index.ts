import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TOrgPermission = {
  actor: ActorType;
  actorId: string;
  orgId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string | undefined;
};

export type TProjectPermission = {
  actor: ActorType;
  actorId: string;
  projectId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId: string;
};

export type RequiredKeys<T> = {
  [K in keyof T]-?: undefined extends T[K] ? never : K;
}[keyof T];

export type PickRequired<T> = Pick<T, RequiredKeys<T>>;
