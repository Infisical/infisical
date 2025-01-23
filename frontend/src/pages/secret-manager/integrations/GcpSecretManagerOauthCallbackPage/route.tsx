import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { GcpSecretManagerOauthCallbackPage } from "./GcpSecretManagerOauthCallbackPage";

export const GcpSecretManagerOAuthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/gcp-secret-manager/oauth2/callback"
)({
  component: GcpSecretManagerOauthCallbackPage,
  validateSearch: zodValidator(GcpSecretManagerOAuthCallbackPageQueryParamsSchema),
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
          label: "GCP Secret Manager"
        }
      ]
    };
  }
});
