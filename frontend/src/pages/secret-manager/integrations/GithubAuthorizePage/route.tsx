import { createFileRoute } from "@tanstack/react-router";

import { GithubAuthorizePage } from "./GithubAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/github/auth-mode-selection"
)({
  component: GithubAuthorizePage
});
