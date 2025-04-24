import { createFileRoute } from "@tanstack/react-router";

import { KmipPage } from "./KmipPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/kms/$projectId/_kms-layout/kmip"
)({
  component: KmipPage
});
