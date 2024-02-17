import { ProjectMembershipRole, TProjectKeys } from "@app/db/schemas";
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

export type AddUserToWsDTO = {
  decryptKey: TProjectKeys & { sender: { publicKey: string } };
  userPrivateKey: string;
  members: {
    orgMembershipId: string;
    projectMembershipRole: ProjectMembershipRole;
    userPublicKey: string;
  }[];
};
