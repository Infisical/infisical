import { createFileRoute } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SupabaseConfigurePage } from "./SupabaseConfigurePage";

const SupabaseConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/supabase/create"
)({
  component: SupabaseConfigurePage,
  validateSearch: zodValidator(SupabaseConfigurePageQueryParamsSchema)
});
