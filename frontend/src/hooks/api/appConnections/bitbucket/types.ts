export type TBitBucketRepo = {
  id: string;
  name: string; // workspace-slug/repo-slug
};

export type TBitBucketConnectionListRepositoriesResponse = {
  repositories: TBitBucketRepo[];
};
