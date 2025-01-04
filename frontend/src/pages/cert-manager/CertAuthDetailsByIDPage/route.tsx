import { createFileRoute } from "@tanstack/react-router";

import { CertAuthDetailsByIDPage } from "./CertAuthDetailsByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/cert-manager/$projectId/_cert-manager-layout/ca/$caId"
)({
  component: CertAuthDetailsByIDPage
});
