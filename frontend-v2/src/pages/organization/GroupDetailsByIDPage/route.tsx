import { createFileRoute } from "@tanstack/react-router";

import { GroupDetailsByIDPage } from "./GroupDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/groups/$groupId/"
)({
  component: GroupDetailsByIDPage
});
