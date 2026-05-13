export type TGitHubApp = {
  id: string;
  orgId: string;
  name: string;
  appId: string;
  slug: string;
  createdAt: string;
  updatedAt: string;
};

export type TExchangeGitHubManifestCodeDTO = {
  name: string;
  code: string;
};

export type TDeleteGitHubAppDTO = {
  id: string;
};

export type TRegisterGitHubAppDTO = {
  name: string;
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
};
