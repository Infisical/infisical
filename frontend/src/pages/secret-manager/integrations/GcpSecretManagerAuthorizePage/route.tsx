import { createFileRoute } from "@tanstack/react-router";

import { GcpSecretManagerAuthorizePage } from "./GcpSecretManagerAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/authorize"
)({
  component: GcpSecretManagerAuthorizePage
});
