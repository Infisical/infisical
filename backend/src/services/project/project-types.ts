import { ProjectMembershipRole, TProjectKeys } from "@app/db/schemas";
import { TProjectPermission } from "@app/lib/types";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { CaStatus } from "../certificate-authority/certificate-authority-types";
import { KmsType } from "../kms/kms-types";

export enum ProjectFilterType {
  ID = "id",
  SLUG = "slug"
}

export type Filter =
  | {
      type: ProjectFilterType.ID;
      projectId: string;
    }
  | {
      type: ProjectFilterType.SLUG;
      slug: string;
      orgId: string | undefined;
    };

export type TCreateProjectDTO = {
  actor: ActorType;
  actorAuthMethod: ActorAuthMethod;
  actorId: string;
  actorOrgId?: string;
  workspaceName: string;
  slug?: string;
  kmsKeyId?: string;
};

export type TDeleteProjectBySlugDTO = {
  slug: string;
  actor: ActorType;
  actorId: string;
  actorOrgId: string | undefined;
};

export type TGetProjectDTO = {
  filter: Filter;
} & Omit<TProjectPermission, "projectId">;

export type TToggleProjectAutoCapitalizationDTO = {
  autoCapitalization: boolean;
} & TProjectPermission;

export type TUpdateProjectVersionLimitDTO = {
  pitVersionLimit: number;
  workspaceSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateAuditLogsRetentionDTO = {
  auditLogsRetentionDays: number;
  workspaceSlug: string;
} & Omit<TProjectPermission, "projectId">;

export type TUpdateProjectNameDTO = {
  name: string;
} & TProjectPermission;

export type TUpdateProjectDTO = {
  filter: Filter;
  update: {
    name?: string;
    autoCapitalization?: boolean;
  };
} & Omit<TProjectPermission, "projectId">;

export type TDeleteProjectDTO = {
  filter: Filter;
  actor: ActorType;
  actorId: string;
  actorOrgId: string | undefined;
} & Omit<TProjectPermission, "projectId">;

export type TListProjectsDTO = {
  includeRoles: boolean;
} & Omit<TProjectPermission, "projectId">;

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

export type TListProjectCasDTO = {
  status?: CaStatus;
  friendlyName?: string;
  offset?: number;
  limit?: number;
  commonName?: string;
  filter: Filter;
} & Omit<TProjectPermission, "projectId">;

export type TListProjectCertsDTO = {
  filter: Filter;
  offset: number;
  limit: number;
  friendlyName?: string;
  commonName?: string;
} & Omit<TProjectPermission, "projectId">;

export type TListProjectAlertsDTO = TProjectPermission;

export type TUpdateProjectKmsDTO = {
  kms: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string };
} & TProjectPermission;

export type TLoadProjectKmsBackupDTO = {
  backup: string;
} & TProjectPermission;

export type TGetProjectKmsKey = TProjectPermission;

export type TListProjectCertificateTemplatesDTO = TProjectPermission;

export type TGetProjectSlackConfig = TProjectPermission;

export type TUpdateProjectSlackConfig = {
  slackIntegrationId: string;
  isAccessRequestNotificationEnabled: boolean;
  accessRequestChannels: string;
  isSecretRequestNotificationEnabled: boolean;
  secretRequestChannels: string;
} & TProjectPermission;
