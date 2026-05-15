import { OrgServiceActor } from "@app/lib/types";

export type TExchangeGitHubManifestCodeDTO = {
  name: string;
  code: string;
  orgPermission: OrgServiceActor;
};

export type TListGitHubAppsDTO = {
  orgPermission: OrgServiceActor;
};

export type TDeleteGitHubAppDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};

export type TRegisterGitHubAppDTO = {
  name: string;
  appId: string;
  slug: string;
  clientId: string;
  clientSecret: string;
  privateKey: string;
  orgPermission: OrgServiceActor;
};

export type TGitHubAppManifestResponse = {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  pem: string;
  html_url: string;
};

export type TSanitizedGitHubApp = {
  id: string | null;
  orgId: string;
  name: string;
  appId: string;
  slug: string;
  createdAt: Date | null;
  updatedAt: Date | null;
};
