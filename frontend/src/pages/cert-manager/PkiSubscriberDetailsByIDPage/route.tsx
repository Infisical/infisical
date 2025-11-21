import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PkiSubscriberDetailsByIDPage } from "./PkiSubscriberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/cert-management/$projectId/_cert-manager-layout/subscribers/$subscriberName"
)({
  component: PkiSubscriberDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Subscribers",
          link: linkOptions({
            to: "/organizations/$orgId/projects/cert-management/$projectId/subscribers",
            params: {
              orgId: params.orgId,
              projectId: params.projectId
            }
          })
        },
        {
          label: params.subscriberName
        }
      ]
    };
  }
});
