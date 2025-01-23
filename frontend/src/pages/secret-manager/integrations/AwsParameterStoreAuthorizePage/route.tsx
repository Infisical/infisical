import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AWSParameterStoreAuthorizeIntegrationPage } from "./AwsParameterStoreAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/aws-parameter-store/authorize"
)({
  component: AWSParameterStoreAuthorizeIntegrationPage,
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
