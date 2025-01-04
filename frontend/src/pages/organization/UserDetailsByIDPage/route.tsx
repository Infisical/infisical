import { createFileRoute } from "@tanstack/react-router";

import { UserDetailsByIDPage } from "./UserDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/organization/_layout/members/$membershipId"
)({
  component: UserDetailsByIDPage
});
