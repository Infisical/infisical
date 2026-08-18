import { SecretFolderRole, TemporaryPermissionMode } from "@app/db/schemas";
import { OrgServiceActor } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";

export type TFolderGrantActor = {
  actorId: string;
  actorType: ActorType.USER | ActorType.IDENTITY;
};

export type TFolderGrantTypeInput =
  | { isTemporary: false }
  | {
      isTemporary: true;
      temporaryMode: TemporaryPermissionMode;
      temporaryRange: string;
      temporaryAccessStartTime: string;
    };

export type TResolvedFolder = {
  path: string;
  environmentSlug: string;
};

export type TCreateFolderGrantDTO = {
  permission: OrgServiceActor;
  projectId: string;
  folderId: string;
  target: TFolderGrantActor;
  role: SecretFolderRole;
  // undefined means a permanent grant
  type?: TFolderGrantTypeInput;
};

export type TUpdateFolderGrantDTO = {
  permission: OrgServiceActor;
  projectId: string;
  folderId: string;
  target: TFolderGrantActor;
  role?: SecretFolderRole;
  // undefined leaves the temporal state unchanged; { isTemporary: false } makes the grant
  // permanent; a temporary payload restarts the window from its start time
  type?: TFolderGrantTypeInput;
};

export type TDeleteFolderGrantDTO = {
  permission: OrgServiceActor;
  projectId: string;
  folderId: string;
  target: TFolderGrantActor;
};

export type TFolderGrant = {
  id: string;
  projectId: string;
  folderId: string;
  permission: SecretFolderRole;
  environment: string;
  secretPath: string;
  isTemporary: boolean;
  temporaryMode: string | null;
  temporaryRange: string | null;
  temporaryAccessStartTime: Date | null;
  temporaryAccessEndTime: Date | null;
  createdAt: Date;
  updatedAt: Date;
};
