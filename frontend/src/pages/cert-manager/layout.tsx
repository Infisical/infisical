import { createFileRoute } from "@tanstack/react-router";

import { PkiManagerLayout } from "@app/layouts/PkiManagerLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/cert-manager/_cert-manager-layout"
)({
  component: PkiManagerLayout
});
