import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamSessionByIDPage } from "./PamSessionByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layou t/sessions/$sessionId"
)({
  component: PamSessionByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Sessions",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/sessions",
            params
          })
        },
        {
          label: "Details"
        }
      ]
    };
  }
});
