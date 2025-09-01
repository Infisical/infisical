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
}

export interface TSyncResult {
  syncedUsersCount: number;
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
