import { createFileRoute } from "@tanstack/react-router";

import { HashicorpVaultAuthorizePage } from "./HashicorpVaultAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/hashicorp-vault/authorize"
)({
  component: HashicorpVaultAuthorizePage
});
