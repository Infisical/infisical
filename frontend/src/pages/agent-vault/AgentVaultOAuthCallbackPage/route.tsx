import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { AgentVaultOAuthCallbackPage } from "./AgentVaultOAuthCallbackPage";
import { AgentVaultOAuthCallbackQueryParamsSchema } from "./callbackSchema";

export const Route = createFileRoute("/_authenticate/agent-vault/oauth/callback")({
  component: AgentVaultOAuthCallbackPage,
  validateSearch: zodValidator(AgentVaultOAuthCallbackQueryParamsSchema)
});
