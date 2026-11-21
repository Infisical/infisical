import { fixtureMutation } from "../fixture-store";
import { deleteDemoGitHubApp } from "../integrations/demo";
import type { AppConnectionsAdapter, TGitHubAppManifest } from "./contract";

export const appConnectionsDemo: AppConnectionsAdapter = {
  useInitiateGitHubAppManifest: fixtureMutation((): TGitHubAppManifest => {
    throw new Error("The demo can't send you to GitHub to create an app.");
  }),
  useDeleteGitHubApp: fixtureMutation(deleteDemoGitHubApp)
};
