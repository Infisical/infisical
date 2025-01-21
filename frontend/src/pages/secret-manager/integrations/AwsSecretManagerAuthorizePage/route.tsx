import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { AWSSecretManagerAuthorizePage } from "./AwsSecretManagerAuthorizePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-manager/$projectId/_secret-manager-layout/integrations/aws-secret-manager/authorize"
)({
  component: AWSSecretManagerAuthorizePage,
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
          label: "AWS Secret Manager"
        }
      ]
    };
  }
});
