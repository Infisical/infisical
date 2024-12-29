import { createFileRoute } from "@tanstack/react-router";

import { RoleDetailsBySlugPage } from "./RoleDetailsBySlugPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/ssh/$projectId/_ssh-layout/roles/$roleSlug"
)({
  component: RoleDetailsBySlugPage
});
