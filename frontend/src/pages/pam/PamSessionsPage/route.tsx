import { createFileRoute } from "@tanstack/react-router";

import { PamSessionsPage } from "./PamSessionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/sessions"
)({
  component: PamSessionsPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Sessions"
        }
      ]
    };
  }
});
