import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { OauthConsentPage } from "./OauthConsentPage";

const OauthConsentPageQuerySchema = z.object({
  response_type: z.string(),
  client_id: z.string(),
  redirect_uri: z.string(),
  state: z.string().optional(),
  code_challenge: z.string().optional(),
  code_challenge_method: z.string().optional(),
  scope: z.string().optional()
});

export const Route = createFileRoute("/_authenticate/organization/oauth-consent")({
  component: OauthConsentPage,
  validateSearch: zodValidator(OauthConsentPageQuerySchema)
});
