import { createFileRoute } from "@tanstack/react-router";

import { RoleByIDPage } from "./RoleByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/roles/$roleId")({
  component: RoleByIDPage
});
