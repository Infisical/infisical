import { createFileRoute } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage
});
