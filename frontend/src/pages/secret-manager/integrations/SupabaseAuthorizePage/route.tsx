import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SupabaseAuthorizePage } from "./SupabaseAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/supabase/authorize"
)({
  component: SupabaseAuthorizePage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Integrations",
          link: linkOptions({
            to: "/secret-manager/$projectId/integrations",
            params
          })
        },
        {
          label: "Supabase"
        }
      ]
    };
  }
});
