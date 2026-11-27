export type TGitLabCreateTokenResponse = {
  id: number;
  token: string;
};

export type TGitLabTokenSettings = {
  name: string;
  description?: string;
  /** sorted, so the same scopes in another order compare equal */
  scopes: string[];
  accessLevel?: number;
};

export type TGitLabTokenCredentials = {
  tokenId: string;
  token: string;
  /** the settings the token was created with; tokens saved before this was recorded have none */
  settings?: TGitLabTokenSettings;
};
