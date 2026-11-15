import type { TGitHubApp } from "@app/hooks/api/gitHubApps/types";

import type { V4Mutation } from "../contract";

/** Main posts this to start creating a GitHub App from Infisical's manifest. */
export type TInitiateGitHubAppManifestDTO = {
  name: string;
  instanceType: "cloud" | "server";
  githubOrg?: string;
  githubHost?: string;
  installState: string;
  projectId?: string;
  gatewayId?: string;
  gatewayPoolId?: string;
};

/** GitHub's create-from-manifest form: the page posts manifest to githubActionUrl with state. */
export type TGitHubAppManifest = {
  state: string;
  manifest: Record<string, unknown>;
  githubActionUrl: string;
};

export type AppConnectionsAdapter = {
  useInitiateGitHubAppManifest: V4Mutation<TInitiateGitHubAppManifestDTO, TGitHubAppManifest>;
  useDeleteGitHubApp: V4Mutation<string, TGitHubApp>;
};
