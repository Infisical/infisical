import { createFileRoute } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage
});
