import { OrderByDirection, TProjectPermission } from "@app/lib/types";
import { SecretsOrderBy } from "@app/services/secret/secret-types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";

export enum ReservedFolders {
  SecretReplication = "__reserve_replication_"
}

export type TCreateFolderDTO = {
  environment: string;
  path: string;
  name: string;
  description?: string | null;
} & TProjectPermission;

export type TUpdateFolderDTO = {
  environment: string;
  path: string;
  id: string;
  name: string;
  description?: string | null;
} & TProjectPermission;

export type TUpdateManyFoldersDTO = {
  projectSlug?: string;
  folders: {
    environment: string;
    path: string;
    id: string;
    name: string;
    description?: string | null;
  }[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteFolderDTO = {
  environment: string;
  path: string;
  idOrName: string;
  forceDelete?: boolean;
} & TProjectPermission;

export type TGetFolderDTO = {
  environment: string;
  path: string;
  search?: string;
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
  recursive?: boolean;
  lastSecretModified?: string;
} & TProjectPermission;

export type TGetFolderByIdDTO = {
  id: string;
} & Omit<TProjectPermission, "projectId">;

// eligibility can optionally be checked against a destination; when provided, the result also reports whether the
// destination is governed by a secret approval policy (a move into such a path is rejected by moveFolder).
export type TGetFolderMoveEligibilityDTO = TGetFolderByIdDTO & {
  destinationEnvironment?: string;
  destinationPath?: string;
};

export type TFolderMoveBlockingType =
  | "dynamic_secret"
  | "secret_rotation"
  | "honey_token"
  | "secret_import"
  | "secret_approval_policy";

export type TFolderMoveEligibility = {
  canMove: boolean;
  folderName: string;
  blockingType?: TFolderMoveBlockingType;
  blockingPath?: string;
  // present only when a destination was supplied to the eligibility check
  destinationBlocked?: boolean;
  // the destination policy's path/name are disclosed only when the actor may read that path
  destinationBlockingPath?: string;
  destinationPolicyName?: string;
};

export type TMoveFolderDTO = {
  folderId: string;
  destinationEnvironment: string;
  destinationPath: string;
  shouldOverwrite?: boolean;
} & TProjectPermission;

export type TMoveFolderResult = {
  folderId: string;
  sourceEnvironment: string;
  sourcePath: string;
  destinationEnvironment: string;
  destinationPath: string;
};

export type TGetFoldersDeepByEnvsDTO = {
  projectId: string;
  environments: string[];
  secretPath: string;
};

export type TFindFoldersDeepByParentIdsDTO = {
  parentIds: string[];
  orderBy?: SecretsOrderBy;
  orderDirection?: OrderByDirection;
};

export type TCreateManyFoldersDTO = {
  projectId: string;
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId?: string;
  folders: Array<{
    name: string;
    environment: string;
    path: string;
    description?: string | null;
  }>;
};

export type TDeleteManyFoldersDTO = {
  projectId: string;
  actor: ActorType;
  actorId: string;
  actorAuthMethod: ActorAuthMethod;
  actorOrgId?: string;
  folders: Array<{
    environment: string;
    path: string;
    idOrName: string;
  }>;
};

export type TGetFolderByPathDTO = {
  projectId: string;
  environment: string;
  secretPath: string;
};
