import { createFileRoute } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "../MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/members/$membershipId"
)({
  component: MemberDetailsByIDPage
});
