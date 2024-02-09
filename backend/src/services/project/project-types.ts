import { TProjectPermission } from "@app/lib/types";

import { ActorType } from "../auth/auth-type";

export type TCreateProjectDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId?: string;
  orgId: string;
  workspaceName: string;
};

export type TDeleteProjectDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId?: string;
  projectId: string;
};

export type TGetProjectDTO = {
  actor: ActorType;
  actorId: string;
  actorOrgId?: string;
  projectId: string;
};

export type TUpgradeProjectDTO = {
  userPrivateKey: string;
} & TProjectPermission;
