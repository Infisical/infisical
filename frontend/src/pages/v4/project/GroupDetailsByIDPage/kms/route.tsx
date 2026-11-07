import { createFileRoute } from "@tanstack/react-router";

import { GroupDetailsByIDPage } from "../GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/groups/$groupId"
)({
  component: GroupDetailsByIDPage
});
