import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { LaravelForgeConfigurePage } from "./LaravelForgeConfigurePage";

const LaravelForgeConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/laravel-forge/create"
)({
  component: LaravelForgeConfigurePage,
  validateSearch: zodValidator(LaravelForgeConfigurePageQueryParamsSchema)
});
