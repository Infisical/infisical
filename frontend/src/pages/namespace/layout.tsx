import { createFileRoute } from "@tanstack/react-router";

import { BreadcrumbTypes } from "@app/components/v2";
import { NamespaceLayout } from "@app/layouts/NamespaceLayout";
import { NamespaceSelect } from "@app/layouts/NamespaceLayout/components/NamespaceSelect";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceId/_namespace-layout"
)({
  component: NamespaceLayout,
  beforeLoad: ({ params }) => {
    return {
      breadcrumbs: [
        {
          type: BreadcrumbTypes.Component,
          component: () => <NamespaceSelect namespaceId={params.namespaceId} />
        }
      ]
    };
  }
});
