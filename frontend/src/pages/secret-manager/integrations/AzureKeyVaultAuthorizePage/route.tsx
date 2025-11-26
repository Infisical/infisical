import { createFileRoute, linkOptions } from "@tanstack/react-router";
import z from "zod";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { AzureKeyVaultAuthorizePage } from "./AzureKeyVaultAuthorizePage";

const PageQueryParamsSchema = z.object({
  state: z.string(),
  clientId: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/integrations/azure-key-vault/authorize"
)({
  component: AzureKeyVaultAuthorizePage,
  validateSearch: PageQueryParamsSchema,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/organizations/$orgId/projects/secret-management/$projectId/integrations",
            params,
            search: {
              selectedTab: IntegrationsListPageTabs.NativeIntegrations
            }
          })
        },
        {
          label: "Azure Key Vault"
        }
      ]
    };
  }
});
