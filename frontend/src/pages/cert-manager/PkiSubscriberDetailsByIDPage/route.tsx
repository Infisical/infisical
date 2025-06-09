import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PkiSubscriberDetailsByIDPage } from "./PkiSubscriberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/subscribers/$subscriberName"
)({
  component: PkiSubscriberDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Subscribers",
          link: linkOptions({
            to: "/cert-manager/$projectId/subscribers",
            params: {
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});
