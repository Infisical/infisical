import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { PkiSubscriberDetailsByIDPage } from "./PkiSubscriberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/subscribers/$subscriberName"
)({
  component: PkiSubscriberDetailsByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Subscribers",
          link: linkOptions({
            to: "/organizations/$orgId/cert-manager/subscribers",
            params: {
              orgId: params.orgId
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
