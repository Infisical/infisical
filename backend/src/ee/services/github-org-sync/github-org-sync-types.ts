import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";
import { OrgServiceActor } from "@app/lib/types";

export interface TCreateGithubOrgSyncDTO {
  orgPermission: OrgServiceActor;
  githubOrgName: string;
  githubOrgAccessToken?: string;
  isActive?: boolean;
}

export interface TUpdateGithubOrgSyncDTO {
  orgPermission: OrgServiceActor;
  githubOrgName?: string;
  githubOrgAccessToken?: string;
  isActive?: boolean;
}

export interface TDeleteGithubOrgSyncDTO {
  orgPermission: OrgServiceActor;
}

export interface TGetGithubOrgSyncDTO {
  orgPermission: OrgServiceActor;
}

export interface TSyncAllTeamsDTO {
  orgPermission: OrgServiceActor;
  auditLogInfo: AuditLogInfo;
}

export interface TSyncUserGroupsDTO {
  orgId: string;
  userId: string;
  username: string;
  accessToken: string;
  auditLogInfo: AuditLogInfo;
}

export interface TSyncResult {
  totalUsers: number;
  errors: string[];
  createdTeams: string[];
  updatedTeams: string[];
  removedMemberships: number;
  syncDuration: number;
}

export interface TValidateGithubTokenDTO {
  orgPermission: OrgServiceActor;
  githubOrgAccessToken: string;
}
