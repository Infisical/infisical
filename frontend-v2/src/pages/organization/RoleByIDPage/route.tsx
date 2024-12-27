import { createFileRoute } from "@tanstack/react-router";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/roles/$roleId"
)({
  component: RoleByIDPage
});
