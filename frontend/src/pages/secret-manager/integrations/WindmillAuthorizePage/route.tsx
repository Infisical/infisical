import { createFileRoute } from "@tanstack/react-router";

import { WindmillAuthorizePage } from "./WindmillAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/windmill/authorize"
)({
  component: WindmillAuthorizePage
});
