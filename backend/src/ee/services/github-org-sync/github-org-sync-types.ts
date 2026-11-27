import { TActorContext } from "@app/domains/lib/actor-context";
import { AuditLogInfo } from "@app/ee/services/audit-log/audit-log-types";

export interface TCreateGithubOrgSyncDTO {
  orgPermission: TActorContext;
  githubOrgName: string;
  githubOrgAccessToken?: string;
  isActive?: boolean;
}

export interface TUpdateGithubOrgSyncDTO {
  orgPermission: TActorContext;
  githubOrgName?: string;
  githubOrgAccessToken?: string;
  isActive?: boolean;
}

export interface TDeleteGithubOrgSyncDTO {
  orgPermission: TActorContext;
}

export interface TGetGithubOrgSyncDTO {
  orgPermission: TActorContext;
}

export interface TSyncAllTeamsDTO {
  orgPermission: TActorContext;
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
  orgPermission: TActorContext;
  githubOrgAccessToken: string;
}
