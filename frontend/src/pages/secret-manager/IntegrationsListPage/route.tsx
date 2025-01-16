import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { IntegrationsListPageTabs } from "@app/types/integrations";

import { IntegrationsListPage } from "./IntegrationsListPage";

const IntegrationsListPageQuerySchema = z.object({
  selectedTab: z.string().catch(IntegrationsListPageTabs.NativeIntegrations)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/"
)({
  component: IntegrationsListPage,
  validateSearch: zodValidator(IntegrationsListPageQuerySchema)
});
