export type TGithubOrgSyncConfig = {
  id: string;
  orgId: string;
  githubOrgAccessToken?: string;
  githubOrgName: string;
  createdAt: string;
  isActive?: boolean;
};

export interface TCreateGithubOrgSyncDTO {
  githubOrgName: string;
  githubOrgAccessToken?: string;
  isActive?: boolean;
}

export interface TUpdateGithubOrgSyncDTO {
  githubOrgName?: string;
  githubOrgAccessToken?: string;
  isActive?: boolean;
}
