import { createFileRoute } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "./MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/members/$membershipId"
)({
  component: MemberDetailsByIDPage
});
