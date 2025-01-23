import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { AWSParameterStoreConfigurePage } from "./AwsParamterStoreConfigurePage";

const AwsParameterStoreConfigurePageQueryParamsSchema = z.object({
  integrationAuthId: z.string()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/aws-parameter-store/create"
)({
  component: AWSParameterStoreConfigurePage,
  validateSearch: zodValidator(AwsParameterStoreConfigurePageQueryParamsSchema),
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
          label: "AWS Parameter Store"
        }
      ]
    };
  }
});
