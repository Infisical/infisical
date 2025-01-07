import { createFileRoute } from "@tanstack/react-router";
import z from 'zod'

import { AzureKeyVaultAuthorizePage } from "./AzureKeyVaultAuthorizePage";


const PageQueryParamsSchema = z.object({
  state: z.string(),
  clientId: z.string().optional(),
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-key-vault/authorize"
)({
  component: AzureKeyVaultAuthorizePage,
  validateSearch: PageQueryParamsSchema
});
