import { createFileRoute } from "@tanstack/react-router";

import { McpServerOauthAuthorizePage } from "./McpServerOauthAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/pam/$projectId/_pam-layout/mcp-server-oauth/$accountId/authorize"
)({
  component: McpServerOauthAuthorizePage
});
