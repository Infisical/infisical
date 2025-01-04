import { createFileRoute } from "@tanstack/react-router";

import { Cloud66AuthorizePage } from "./Cloud66AuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/cloud-66/authorize"
)({
  component: Cloud66AuthorizePage
});
