import { createFileRoute } from "@tanstack/react-router";

import { IdentityDetailsByIDPage } from "../IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/v4/organizations/$orgId/projects/kms/$projectId/identities/$identityId"
)({
  component: IdentityDetailsByIDPage
});
