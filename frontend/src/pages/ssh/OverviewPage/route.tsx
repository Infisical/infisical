import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "./OverviewPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/ssh/$projectId/_ssh-layout/overview"
)({
  component: OverviewPage
});
