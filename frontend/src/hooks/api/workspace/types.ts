import { TProjectRole } from "../roles/types";

export enum ProjectVersion {
  V1 = 1,
  V2 = 2,
  V3 = 3
}

export enum ProjectUserMembershipTemporaryMode {
  Relative = "relative"
}

export type Workspace = {
  __v: number;
  id: string;
  name: string;
  orgId: string;
  version: ProjectVersion;
  upgradeStatus: string | null;
  updatedAt: string;
  autoCapitalization: boolean;
  environments: WorkspaceEnv[];
  pitVersionLimit: number;
  auditLogsRetentionDays: number;
  slug: string;
  createdAt: string;

  roles?: TProjectRole[];
};

export type WorkspaceEnv = {
  id: string;
  name: string;
  slug: string;
};

export type WorkspaceTag = { id: string; name: string; slug: string };

export type NameWorkspaceSecretsDTO = {
  workspaceId: string;
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
  kmsKeyId?: string;
};

export type RenameWorkspaceDTO = { workspaceID: string; newWorkspaceName: string };
export type UpdatePitVersionLimitDTO = { projectSlug: string; pitVersionLimit: number };
export type UpdateAuditLogsRetentionDTO = { projectSlug: string; auditLogsRetentionDays: number };
export type ToggleAutoCapitalizationDTO = { workspaceID: string; state: boolean };

export type DeleteWorkspaceDTO = { workspaceID: string };

export type CreateEnvironmentDTO = {
  workspaceId: string;
  name: string;
  slug: string;
};

export type ReorderEnvironmentsDTO = {
  workspaceId: string;
  environmentSlug: string;
  environmentName: string;
  otherEnvironmentSlug: string;
  otherEnvironmentName: string;
};

export type UpdateEnvironmentDTO = {
  workspaceId: string;
  id: string;
  name?: string;
  slug?: string;
  position?: number;
};

export type DeleteEnvironmentDTO = { workspaceId: string; id: string };

export type TUpdateWorkspaceUserRoleDTO = {
  membershipId: string;
  workspaceId: string;
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

export type TUpdateWorkspaceIdentityRoleDTO = {
  identityId: string;
  workspaceId: string;
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
  groupSlug: string;
  projectSlug: string;
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
  workspaceId: string;
  offset?: number;
  limit?: number;
  orderBy?: string;
  direction?: string;
  textFilter?: string;
};
