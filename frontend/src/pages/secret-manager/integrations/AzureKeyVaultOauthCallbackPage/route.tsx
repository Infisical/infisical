import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AzureKeyVaultOauthCallbackPage } from "./AzureKeyVaultOauthCallback";

export const AzureKeyVaultOauthCallbackQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/azure-key-vault/oauth2/callback"
)({
  component: AzureKeyVaultOauthCallbackPage,
  validateSearch: zodValidator(AzureKeyVaultOauthCallbackQueryParamsSchema)
});
