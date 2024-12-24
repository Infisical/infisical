import { createFileRoute } from "@tanstack/react-router";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/roles/$roleId/"
)({
  component: RoleByIDPage
});
