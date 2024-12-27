import { createFileRoute } from "@tanstack/react-router";

import { OverviewPage } from "./OverviewPage";

export const Route = createFileRoute("/_authenticate/admin/_admin-layout/")({
  component: OverviewPage
});
