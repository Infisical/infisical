import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";

import { handoffToV4 } from "@app/helpers/v4Bridge";

import { AgentVaultOAuthCallbackPage } from "./AgentVaultOAuthCallbackPage";
import { AgentVaultOauthCallbackQueryParamsSchema } from "./callbackSchema";

export const Route = createFileRoute("/_authenticate/agent-vault/oauth/callback")({
  component: AgentVaultOAuthCallbackPage,
  validateSearch: zodValidator(AgentVaultOauthCallbackQueryParamsSchema),
  beforeLoad: ({ location }) => handoffToV4(location)
});
