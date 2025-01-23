import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AzureKeyVaultConfigurePage } from "./AzureKeyVaultConfigurePage";

const AzureKeyVaultConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/azure-key-vault/create"
)({
  component: AzureKeyVaultConfigurePage,
  validateSearch: zodValidator(AzureKeyVaultConfigurePageQueryParamsSchema),
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
          label: "Azure Key Vault"
        }
      ]
    };
  }
});
