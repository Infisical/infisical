import { createFileRoute } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "./MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/members/$membershipId"
)({
  component: MemberDetailsByIDPage
});
