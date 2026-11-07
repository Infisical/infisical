import { createFileRoute } from "@tanstack/react-router";

import { WorkbenchFallback } from "../WorkbenchFallback";

export const Route = createFileRoute("/design-system/$")({
  component: WorkbenchFallback
});
