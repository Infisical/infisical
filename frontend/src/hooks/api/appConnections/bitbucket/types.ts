export type TBitbucketWorkspace = {
  slug: string;
};

export type TBitbucketRepo = {
  uuid: string;
  slug: string;
  full_name: string; // workspace-slug/repo-slug
};

export type TBitbucketConnectionListWorkspacesResponse = {
  workspaces: TBitbucketWorkspace[];
};

export type TBitbucketConnectionListRepositoriesResponse = {
  repositories: TBitbucketRepo[];
};
