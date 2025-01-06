import { createFileRoute } from "@tanstack/react-router";

import { GroupDetailsByIDPage } from "./GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/groups/$groupId"
)({
  component: GroupDetailsByIDPage
});
