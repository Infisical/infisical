import { Knex } from "knex";

import { ProjectType, SortDirection, TProjectKeys } from "@app/db/schemas";
import { TSshCertificateAuthorityDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-dal";
import { TSshCertificateAuthoritySecretDALFactory } from "@app/ee/services/ssh/ssh-certificate-authority-secret-dal";
import { OrgServiceActor, TProjectPermission } from "@app/lib/types";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectSshConfigDALFactory } from "@app/services/project/project-ssh-config-dal";

import { ActorAuthMethod, ActorType } from "../auth/auth-type";
import { WorkflowIntegration } from "../workflow-integration/workflow-integration-types";

enum KmsType {
  External = "external",
  Internal = "internal"
}

enum CaStatus {
  ACTIVE = "active",
  DISABLED = "disabled",
  PENDING_CERTIFICATE = "pending-certificate"
}

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
  workspaceDescription?: string;
  slug?: string;
  kmsKeyId?: string;
  createDefaultEnvs?: boolean;
  template?: string;
  tx?: Knex;
  type?: ProjectType;
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

export type TToggleProjectDeleteProtectionDTO = {
  hasDeleteProtection: boolean;
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
    description?: string;
    autoCapitalization?: boolean;
    hasDeleteProtection?: boolean;
    defaultProduct?: ProjectType;
    slug?: string;
    secretSharing?: boolean;
    showSnapshotsLegacy?: boolean;
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
  type?: ProjectType | "all";
} & Omit<TProjectPermission, "projectId">;

export type TUpgradeProjectDTO = {
  userPrivateKey: string;
} & TProjectPermission;

export type AddUserToWsDTO = {
  decryptKey: TProjectKeys & { sender: { publicKey: string } };
  userPrivateKey: string;
  members: {
    orgMembershipId: string;
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

export type TListProjectSshCasDTO = TProjectPermission;
export type TListProjectSshHostsDTO = TProjectPermission;
export type TListProjectSshCertificateTemplatesDTO = TProjectPermission;
export type TListProjectPkiSubscribersDTO = TProjectPermission;
export type TListProjectSshCertificatesDTO = {
  offset: number;
  limit: number;
} & TProjectPermission;

export type TUpdateProjectSshConfig = {
  defaultUserSshCaId?: string;
  defaultHostSshCaId?: string;
} & TProjectPermission;

export type TGetProjectSshConfig = TProjectPermission;

export type TGetProjectWorkflowIntegrationConfig = TProjectPermission & {
  integration: WorkflowIntegration;
};

export type TUpdateProjectWorkflowIntegration = (
  | {
      integrationId: string;
      integration: WorkflowIntegration.SLACK;
      isAccessRequestNotificationEnabled: boolean;
      isSecretRequestNotificationEnabled: boolean;
      accessRequestChannels?: string;
      secretRequestChannels?: string;
    }
  | {
      integrationId: string;
      integration: WorkflowIntegration.MICROSOFT_TEAMS;
      isAccessRequestNotificationEnabled: boolean;
      isSecretRequestNotificationEnabled: boolean;
      accessRequestChannels?: { teamId: string; channelIds: string[] };
      secretRequestChannels?: { teamId: string; channelIds: string[] };
    }
) &
  TProjectPermission;

export type TDeleteProjectWorkflowIntegration = {
  integrationId: string;
  integration: WorkflowIntegration;
} & TProjectPermission;

export type TBootstrapSshProjectDTO = {
  projectId: string;
  sshCertificateAuthorityDAL: Pick<TSshCertificateAuthorityDALFactory, "transaction" | "create">;
  sshCertificateAuthoritySecretDAL: Pick<TSshCertificateAuthoritySecretDALFactory, "create">;
  projectSshConfigDAL: Pick<TProjectSshConfigDALFactory, "create">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  tx?: Knex;
};

export enum SearchProjectSortBy {
  NAME = "name"
}

export type TSearchProjectsDTO = {
  permission: OrgServiceActor;
  name?: string;
  type?: ProjectType;
  limit?: number;
  offset?: number;
  orderBy?: SearchProjectSortBy;
  orderDirection?: SortDirection;
};

export type TProjectAccessRequestDTO = {
  permission: OrgServiceActor;
  projectId: string;
  comment?: string;
};
