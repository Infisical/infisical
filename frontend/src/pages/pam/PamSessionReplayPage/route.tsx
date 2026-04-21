import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PamSessionReplayPage } from "./PamSessionReplayPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/pam/$projectId/_pam-layout/sessions/$sessionId/replay"
)({
  component: PamSessionReplayPage,
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
          label: "Details",
          link: linkOptions({
            to: "/organizations/$orgId/projects/pam/$projectId/sessions/$sessionId",
            params
          })
        },
        {
          label: "Replay"
        }
      ]
    };
  }
});
