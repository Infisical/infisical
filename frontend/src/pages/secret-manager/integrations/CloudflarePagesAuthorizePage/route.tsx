import { createFileRoute } from "@tanstack/react-router";

import { CloudflarePagesAuthorizePage } from "./CloudflarePagesAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloudflare-pages/authorize"
)({
  component: CloudflarePagesAuthorizePage
});
