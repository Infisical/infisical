import { createFileRoute } from "@tanstack/react-router";

import { SupabaseAuthorizePage } from "./SupabaseAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/secret-manager/$projectId/_secret-manager-layout/integrations/supabase/authorize"
)({
  component: SupabaseAuthorizePage
});
