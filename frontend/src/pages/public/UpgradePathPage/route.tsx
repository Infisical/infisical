import { createFileRoute } from "@tanstack/react-router";

import { UpgradePathPage } from "./UpgradePathPage";

export const Route = createFileRoute("/upgrade-path")({
  component: UpgradePathPage
});
