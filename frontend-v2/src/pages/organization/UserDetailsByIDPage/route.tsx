import { createFileRoute } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/organization/_layout-org/memberships/$membershipId/"
)({
  component: UserDetailsByIDPage
});
