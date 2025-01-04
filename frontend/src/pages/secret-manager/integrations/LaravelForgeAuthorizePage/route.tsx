import { createFileRoute } from "@tanstack/react-router";

import { LaravelForgeAuthorizePage } from "./LaravelForgeAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/laravel-forge/authorize"
)({
  component: LaravelForgeAuthorizePage
});
