import { createFileRoute } from "@tanstack/react-router";

import { PamAccessRedirect } from "./PamAccessRedirect";

export const Route = createFileRoute("/v4/organizations/$orgId/pam/access")({
  component: PamAccessRedirect
});
