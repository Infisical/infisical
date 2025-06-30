import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { NetlifyOauthCallbackPage } from "./NetlifyOauthCallbackPage";

export const NetlifyOAuthCallbackPageQueryParamsSchema = z.object({
  state: z.string().catch(""),
  code: z.coerce.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/integrations/netlify/oauth2/callback"
)({
  component: NetlifyOauthCallbackPage,
  validateSearch: zodValidator(NetlifyOAuthCallbackPageQueryParamsSchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/projects/$projectId/secret-manager/integrations",
            params,
            search: {
              selectedTab: IntegrationsListPageTabs.NativeIntegrations
            }
          })
        },
        {
          label: "Netlify"
        }
      ]
    };
  }
});
