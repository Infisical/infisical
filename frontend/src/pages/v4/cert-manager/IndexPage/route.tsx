import { createFileRoute } from "@tanstack/react-router";

import { IndexPage } from "./IndexPage";

export const Route = createFileRoute("/v4/organizations/$orgId/cert-manager/")({
  component: IndexPage
});
