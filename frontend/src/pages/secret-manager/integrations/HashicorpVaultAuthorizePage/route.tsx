import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { HashicorpVaultAuthorizePage } from "./HashicorpVaultAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/hashicorp-vault/authorize"
)({
  component: HashicorpVaultAuthorizePage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/secret-manager/$projectId/integrations",
            params
          })
        },
        {
          label: "Hashicorp Vault"
        }
      ]
    };
  }
});
