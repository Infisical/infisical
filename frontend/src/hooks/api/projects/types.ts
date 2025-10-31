import { OrderByDirection } from "@app/hooks/api/generic/types";

import { TProjectRole } from "../roles/types";

export enum ProjectVersion {
  V1 = 1,
  V2 = 2,
  V3 = 3
}

export enum ProjectType {
  SecretManager = "secret-manager",
  CertificateManager = "cert-manager",
  KMS = "kms",
  SSH = "ssh",
  SecretScanning = "secret-scanning",
  PAM = "pam"
}

export enum ProjectUserMembershipTemporaryMode {
  Relative = "relative"
}

export type Project = {
  __v: number;
  id: string;
  name: string;
  type: ProjectType;
  description?: string;
  orgId: string;
  version: ProjectVersion;
  upgradeStatus: string | null;
  updatedAt: string;
  autoCapitalization: boolean;
  environments: ProjectEnv[];
  pitVersionLimit: number;
  auditLogsRetentionDays: number;
  slug: string;
  createdAt: string;
  roles?: TProjectRole[];
  hasDeleteProtection: boolean;
  secretSharing: boolean;
  showSnapshotsLegacy: boolean;
  secretDetectionIgnoreValues: string[];
};

export type ProjectEnv = {
  id: string;
  name: string;
  slug: string;
};

export type ProjectTag = { id: string; name: string; slug: string };

export type NameWorkspaceSecretsDTO = {
  projectId: string;
  secretsToUpdate: {
    secretName: string;
    secretId: string;
  }[];
};

export type TGetUpgradeProjectStatusDTO = {
  projectId: string;
  onSuccess?: (data?: { status: string }) => void;
  enabled?: boolean;
  refetchInterval?: number;
};

// mutation dto
export type CreateWorkspaceDTO = {
  projectName: string;
  type: ProjectType;
  projectDescription?: string;
  kmsKeyId?: string;
  template?: string;
};

export type UpdateProjectDTO = {
  projectId: string;
  newProjectName?: string;
  newProjectDescription?: string;
  newSlug?: string;
  secretSharing?: boolean;
  showSnapshotsLegacy?: boolean;
  secretDetectionIgnoreValues?: string[];
  pitVersionLimit?: number;
  autoCapitalization?: boolean;
  hasDeleteProtection?: boolean;
};

export type UpdatePitVersionLimitDTO = { projectSlug: string; pitVersionLimit: number };
export type UpdateAuditLogsRetentionDTO = { projectSlug: string; auditLogsRetentionDays: number };
export type ToggleAutoCapitalizationDTO = { projectID: string; state: boolean };
export type ToggleDeleteProjectProtectionDTO = { projectID: string; state: boolean };

export type DeleteWorkspaceDTO = { projectID: string };

export type CreateEnvironmentDTO = {
  projectId: string;
  name: string;
  slug: string;
};

export type ReorderEnvironmentsDTO = {
  projectId: string;
  environmentSlug: string;
  environmentName: string;
  otherEnvironmentSlug: string;
  otherEnvironmentName: string;
};

export type UpdateEnvironmentDTO = {
  projectId: string;
  id: string;
  name?: string;
  slug?: string;
  position?: number;
};

export type DeleteEnvironmentDTO = { projectId: string; id: string };

export type TUpdateWorkspaceUserRoleDTO = {
  membershipId: string;
  projectId: string;
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: ProjectUserMembershipTemporaryMode;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
};

export type TUpdateWorkspaceGroupRoleDTO = {
  groupId: string;
  projectId: string;
  roles: (
    | {
        role: string;
        isTemporary?: false;
      }
    | {
        role: string;
        isTemporary: true;
        temporaryMode: ProjectUserMembershipTemporaryMode;
        temporaryRange: string;
        temporaryAccessStartTime: string;
      }
  )[];
};

export type TListProjectIdentitiesDTO = {
  projectId: string;
  offset?: number;
  limit?: number;
  orderBy?: ProjectIdentityOrderBy;
  orderDirection?: OrderByDirection;
  search?: string;
};

export enum ProjectIdentityOrderBy {
  Name = "name"
}
export type TSearchProjectsDTO = {
  name?: string;
  limit?: number;
  offset?: number;
  projectIds?: string[];
  type?: ProjectType;
  options?: { enabled?: boolean };
  orderBy?: ProjectIdentityOrderBy;
  orderDirection?: OrderByDirection;
};

export type TProjectSshConfig = {
  id: string;
  createdAt: string;
  updatedAt: string;
  projectId: string;
  defaultUserSshCaId: string | null;
  defaultHostSshCaId: string | null;
};

export type TUpdateProjectSshConfigDTO = {
  projectId: string;
  defaultUserSshCaId?: string;
  defaultHostSshCaId?: string;
};
