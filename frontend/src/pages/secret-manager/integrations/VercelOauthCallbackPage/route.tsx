import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { VercelOauthCallbackPage } from "./VercelOauthCallbackPage";

export const VercelOAuthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/vercel/oauth2/callback"
)({
  component: VercelOauthCallbackPage,
  validateSearch: zodValidator(VercelOAuthCallbackPageQueryParamsSchema)
});
