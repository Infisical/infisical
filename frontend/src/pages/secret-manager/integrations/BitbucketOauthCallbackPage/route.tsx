import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { BitbucketOauthCallbackPage } from "./BitbucketOauthCallbackPage";

export const BitbucketOauthCallbackQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/bitbucket/oauth2/callback"
)({
  component: BitbucketOauthCallbackPage,
  validateSearch: zodValidator(BitbucketOauthCallbackQueryParamsSchema),
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
          label: "Bitbucket"
        }
      ]
    };
  }
});
