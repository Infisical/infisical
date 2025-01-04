import { createFileRoute } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "./MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/ssh/$projectId/_ssh-layout/members/$membershipId"
)({
  component: MemberDetailsByIDPage
});
