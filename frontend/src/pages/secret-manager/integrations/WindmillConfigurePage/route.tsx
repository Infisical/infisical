import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { WindmillConfigurePage } from "./WindmillConfigurePage";

const WindmillConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/windmill/create"
)({
  component: WindmillConfigurePage,
  validateSearch: zodValidator(WindmillConfigurePageQueryParamsSchema),
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
          label: "Windmill"
        }
      ]
    };
  }
});
