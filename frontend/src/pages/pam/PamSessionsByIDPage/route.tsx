import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamSessionByIDPage } from "./PamSessionByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/pam/$projectId/_pam-layout/sessions/$sessionId"
)({
  component: PamSessionByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Sessions",
          link: linkOptions({
            to: "/projects/pam/$projectId/sessions",
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
