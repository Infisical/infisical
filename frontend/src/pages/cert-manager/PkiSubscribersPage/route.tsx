import { createFileRoute } from "@tanstack/react-router";

import { PkiSubscribersPage } from "./PkiSubscribersPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/cert-management/$projectId/_cert-manager-layout/subscribers/"
)({
  component: PkiSubscribersPage,
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Subscribers"
        }
      ]
    };
  }
});
