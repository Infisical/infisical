import { NamespaceLayout } from "@app/layouts/NamespaceLayout";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organization/namespaces/$namespaceName/_namespace-layout"
)({
  component: NamespaceLayout
});
