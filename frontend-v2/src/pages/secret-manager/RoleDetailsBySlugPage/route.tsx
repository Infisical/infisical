import { createFileRoute } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/roles/$roleSlug/"
)({
  component: RoleDetailsBySlugPage
});
