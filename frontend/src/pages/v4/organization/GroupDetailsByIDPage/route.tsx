import { createFileRoute } from "@tanstack/react-router";

import { GroupDetailsByIDPage } from "./GroupDetailsByIDPage";

export const Route = createFileRoute("/v4/organizations/$orgId/groups/$groupId")({
  component: GroupDetailsByIDPage
});
