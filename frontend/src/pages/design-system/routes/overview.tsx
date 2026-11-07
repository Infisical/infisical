import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { WorkbenchRoute } from "../WorkbenchPageView";

export const Route = createFileRoute("/design-system/")({
  component: WorkbenchRoute,
  pendingComponent: lazyRouteComponent(() => import("../WorkbenchPending"), "WorkbenchPending")
});
