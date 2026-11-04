import { createFileRoute, lazyRouteComponent } from "@tanstack/react-router";

import { WorkbenchRoute } from "../WorkbenchPageView";

export const Route = createFileRoute("/design-system/patterns/$pattern")({
  component: WorkbenchRoute,
  pendingComponent: lazyRouteComponent(() => import("../WorkbenchPending"), "WorkbenchPending")
});
