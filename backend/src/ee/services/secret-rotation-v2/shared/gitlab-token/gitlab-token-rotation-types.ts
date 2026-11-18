export type TGitLabTokenApiContext = {
  /** the instance's REST API root, e.g. https://gitlab.com/api/v4 */
  apiUrl: string;
  headers: Record<string, string>;
};

export type TGitLabCreateTokenResponse = {
  id: number;
  token: string;
};

export type TGitLabTokenCredentials = {
  tokenId: string;
  token: string;
};
