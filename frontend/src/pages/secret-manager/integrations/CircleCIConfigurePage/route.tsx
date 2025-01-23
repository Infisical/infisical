import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { CircleCIConfigurePage } from "./CircleCIConfigurePage";

const CircleCIConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/circleci/create"
)({
  component: CircleCIConfigurePage,
  validateSearch: zodValidator(CircleCIConfigurePageQueryParamsSchema),
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
          label: "Circle CI"
        }
      ]
    };
  }
});
