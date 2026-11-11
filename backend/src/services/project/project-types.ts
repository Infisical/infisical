import { Knex } from "knex";

import { ProjectType, SortDirection, TProjectKeys } from "@app/db/schemas";
import type { TActorContext } from "@app/domains/lib/actor-context";
import { ActorType } from "@app/lib/auth/actor-types";
import { TActorInput } from "@app/lib/types";

import { WorkflowIntegration } from "../workflow-integration/workflow-integration-types";

type TProjectActorInput = { projectId: string } & TActorInput;

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
  actor: TActorContext;
  projectName: string;
  projectDescription?: string;
  slug?: string;
  kmsKeyId?: string;
  createDefaultEnvs?: boolean;
  template?: string;
  pitVersionLimit?: number;
  tx?: Knex;
  type?: ProjectType;
  hasDeleteProtection?: boolean;
};

export type TDeleteProjectBySlugDTO = {
  slug: string;
  actor: ActorType;
  actorId: string;
  actorOrgId: string | undefined;
};

export type TGetProjectDTO = {
  filter: Filter;
} & TActorInput;

export type TToggleProjectAutoCapitalizationDTO = {
  autoCapitalization: boolean;
} & TProjectActorInput;

export type TToggleProjectDeleteProtectionDTO = {
  hasDeleteProtection: boolean;
} & TProjectActorInput;

export type TEnableSecretBlindIndexDTO = TProjectActorInput;

export type TUpdateProjectVersionLimitDTO = {
  pitVersionLimit: number;
  workspaceSlug: string;
} & TActorInput;

export type TUpdateAuditLogsRetentionDTO = {
  auditLogsRetentionDays: number;
  filter: Filter;
} & TActorInput;

export type TUpdateProjectNameDTO = {
  name: string;
} & TProjectActorInput;

export type TUpdateProjectDTO = {
  filter: Filter;
  update: {
    name?: string;
    description?: string;
    pitVersionLimit?: number;
    autoCapitalization?: boolean;
    hasDeleteProtection?: boolean;
    defaultProduct?: ProjectType;
    slug?: string;
    secretSharing?: boolean;
    showSnapshotsLegacy?: boolean;
    secretDetectionIgnoreValues?: string[];
    enforceEncryptedSecretManagerSecretMetadata?: boolean;
    auditLogsRetentionDays?: number;
  };
} & TActorInput;

export type TDeleteProjectDTO = {
  filter: Filter;
  hardDelete?: boolean;
} & TActorInput;

export type TListDeletedProjectsDTO = {
  type?: ProjectType;
} & TActorInput;

export type TListProjectsDTO = {
  includeRoles: boolean;
  type?: ProjectType;
} & TActorInput;

export type TUpgradeProjectDTO = {
  userPrivateKey: string;
} & TProjectActorInput;

export type AddUserToWsDTO = {
  decryptKey: TProjectKeys & { sender: { publicKey?: string } };
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
} & TActorInput;

export type TListProjectCertsDTO = {
  filter: Filter;
  offset: number;
  limit: number;
  friendlyName?: string;
  commonName?: string;
  forPkiSync?: boolean;
  search?: string;
  status?: string | string[];
  includeDeleted?: boolean;
  profileIds?: string[];
  fromDate?: Date;
  toDate?: Date;
  metadataFilter?: Array<{ key: string; value?: string }>;
  extendedKeyUsage?: string;
  keyAlgorithm?: string | string[];
  signatureAlgorithm?: string;
  keySizes?: number[];
  caIds?: string[];
  enrollmentTypes?: string[];
  source?: string | string[];
  notAfterFrom?: Date;
  notAfterTo?: Date;
  notBeforeFrom?: Date;
  notBeforeTo?: Date;
  applicationId?: string;
  applicationIds?: string[];
  sortBy?: string;
  sortOrder?: "asc" | "desc";
} & TActorInput;

export type TGetDashboardStatsDTO = {
  filter: Filter;
} & TActorInput;

export type TGetActivityTrendDTO = {
  filter: Filter;
  range?: string;
} & TActorInput;

export type TListProjectAlertsDTO = TProjectActorInput;

export type TUpdateProjectKmsDTO = {
  kms: { type: KmsType.Internal } | { type: KmsType.External; kmsId: string };
} & TProjectActorInput;

export type TLoadProjectKmsBackupDTO = {
  backup: string;
} & TProjectActorInput;

export type TGetProjectKmsKey = TProjectActorInput;

export type TListProjectCertificateTemplatesDTO = TProjectActorInput;

export type TListProjectPkiSubscribersDTO = TProjectActorInput;

export type TGetProjectWorkflowIntegrationConfig = TProjectActorInput & {
  integration: WorkflowIntegration;
};

export type TUpdateProjectWorkflowIntegration = (
  | {
      integrationId: string;
      integration: WorkflowIntegration.SLACK;
      isAccessRequestNotificationEnabled: boolean;
      isSecretRequestNotificationEnabled: boolean;
      isSecretSyncErrorNotificationEnabled: boolean;
      accessRequestChannels?: string;
      secretRequestChannels?: string;
      secretSyncErrorChannels?: string;
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
  TProjectActorInput;

export type TDeleteProjectWorkflowIntegration = {
  integrationId: string;
  integration: WorkflowIntegration;
} & TProjectActorInput;

export enum SearchProjectSortBy {
  NAME = "name",
  DESCRIPTION = "description",
  CREATED_AT = "createdAt"
}

export type TSearchProjectsDTO = {
  actor: TActorContext;
  name?: string;
  type?: ProjectType;
  limit?: number;
  offset?: number;
  orderBy?: SearchProjectSortBy;
  projectIds?: string[];
  orderDirection?: SortDirection;
};

export type TProjectAccessRequestDTO = {
  actor: TActorContext;
  projectId: string;
  comment?: string;
};
