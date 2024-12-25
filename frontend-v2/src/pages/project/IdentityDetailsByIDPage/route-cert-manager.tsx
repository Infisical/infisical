import { createFileRoute } from "@tanstack/react-router";
import { IdentityDetailsByIDPage } from "./IdentityDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_ctx-org-details/secret-manager/$projectId/_layout-secret-manager/identities/$identityId/"
)({
  component: IdentityDetailsByIDPage
});
