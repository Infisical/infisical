import { ProjectOperationType } from "@app/db/schemas";
import { ActorAuthMethod, ActorType } from "@app/services/auth/auth-type";

export type TBuildProjectPermissionDTO = {
  permissions?: unknown;
  role: string;
}[];

export type TBuildOrgPermissionDTO = {
  permissions?: unknown;
  role: string;
}[];

export type TGetUserProjectPermissionArg = {
  userId: string;
  projectId: string;
  authMethod: ActorAuthMethod;
  projectOperationType: ProjectOperationType;
  userOrgId?: string;
};

export type TGetIdentityProjectPermissionArg = {
  identityId: string;
  projectId: string;
  identityOrgId?: string;
  projectOperationType: ProjectOperationType;
};

export type TGetServiceTokenProjectPermissionArg = {
  serviceTokenId: string;
  projectId: string;
  actorOrgId?: string;
  projectOperationType: ProjectOperationType;
};

export type TGetProjectPermissionArg = {
  actor: ActorType;
  actorId: string;
  projectId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId?: string;
  projectOperationType: ProjectOperationType;
};
