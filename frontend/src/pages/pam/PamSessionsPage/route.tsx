import { createFileRoute } from "@tanstack/react-router";

import { PamSessionPage } from "./PamSessionsPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/sessions/"
)({
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Sessions"
        }
      ]
    };
  },
  component: PamSessionPage
});
