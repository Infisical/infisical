import { createFileRoute } from "@tanstack/react-router";

import { MemberDetailsByIDPage } from "./MemberDetailsByIdPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/members/$membershipId/"
)({
  component: MemberDetailsByIDPage
});
