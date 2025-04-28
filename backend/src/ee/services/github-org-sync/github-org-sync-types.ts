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
