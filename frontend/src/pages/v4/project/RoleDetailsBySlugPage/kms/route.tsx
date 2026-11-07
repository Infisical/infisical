import { createFileRoute } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "../RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage
});
