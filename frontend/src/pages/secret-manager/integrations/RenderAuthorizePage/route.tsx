import { createFileRoute } from "@tanstack/react-router";

import { RenderAuthorizePage } from "./RenderAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/render/authorize"
)({
  component: RenderAuthorizePage
});
