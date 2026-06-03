import { OrgServiceActor } from "@app/lib/types";

export type TInitiateGitHubManifestDTO = {
  name: string;
  instanceType: "cloud" | "server";
  githubOrg?: string;
  githubHost?: string;
  installState: string;
  orgPermission: OrgServiceActor;
};

export type TGitHubManifestStatePayload = {
  orgId: string;
  actorId: string;
  actorType: string;
  authMethod: string | null;
  name: string;
  instanceType: "cloud" | "server";
  githubOrg: string;
  githubHost: string;
  installState: string;
};

export type TListGitHubAppsDTO = {
  orgPermission: OrgServiceActor;
};

export type TDeleteGitHubAppDTO = {
  id: string;
  orgPermission: OrgServiceActor;
};

export type TGetGitHubAppInstallationStatusDTO = {
  gitHubAppId?: string;
  orgPermission: OrgServiceActor;
};

export type TGitHubAppManifestResponse = {
  id: number;
  slug: string;
  client_id: string;
  client_secret: string;
  pem: string;
  html_url: string;
  owner?: {
    login?: string;
  } | null;
};

export type TSanitizedGitHubApp = {
  id: string | null;
  orgId: string;
  name: string;
  appId: string;
  slug: string;
  owner: string | null;
  connectionCount: number;
  createdAt: Date | null;
  updatedAt: Date | null;
};
