import { createFileRoute } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "./MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/secret-management/$projectId/members/$membershipId"
)({
  component: MemberDetailsByIDPage
});
