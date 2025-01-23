import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { GithubAuthorizePage } from "./GithubAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/github/auth-mode-selection"
)({
  component: GithubAuthorizePage,
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
          label: "GitHub"
        }
      ]
    };
  }
});
