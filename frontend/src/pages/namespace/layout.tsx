import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { NamespaceLayout } from "@app/layouts/NamespaceLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceId/_namespace-layout"
)({
  component: NamespaceLayout,
  beforeLoad: ({ params }) => {
    return {
      breadcrumbs: [
        {
          label: "Namespaces",
          link: linkOptions({ to: "/organization/projects" })
        },
        {
          label: params.namespaceName
        }
      ]
    };
  }
});
