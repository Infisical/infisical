import { createFileRoute } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "./MemberDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/kms/$projectId/_kms-layout/members/$membershipId"
)({
  component: MemberDetailsByIDPage
});
