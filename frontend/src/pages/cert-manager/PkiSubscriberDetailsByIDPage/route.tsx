import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PkiSubscriberDetailsByIDPage } from "./PkiSubscriberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/subscribers/$subscriberName"
)({
  component: PkiSubscriberDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Subscribers",
          link: linkOptions({
            to: "/projects/cert-management/$projectId/subscribers",
            params: {
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
