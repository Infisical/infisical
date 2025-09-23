import { createFileRoute } from "@tanstack/react-router";

import { NamespaceLayout } from "@app/layouts/NamespaceLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceName/_namespace-layout"
)({
  component: NamespaceLayout
});
