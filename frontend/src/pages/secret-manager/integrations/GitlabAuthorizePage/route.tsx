import { createFileRoute } from "@tanstack/react-router";

import { GitlabAuthorizePage } from "./GitlabAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gitlab/authorize"
)({
  component: GitlabAuthorizePage
});
