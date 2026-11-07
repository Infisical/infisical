import { createFileRoute } from "@tanstack/react-router";

import { DesignSystemPage } from "./DesignSystemPage";

export const Route = createFileRoute("/design-system")({
  component: DesignSystemPage
});
