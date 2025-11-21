import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshCaByIDPage } from "./SshCaByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/ssh/$projectId/_ssh-layout/ca/$caId"
)({
  component: SshCaByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Authorities",
          link: linkOptions({
            to: "/organizations/$orgId/projects/ssh/$projectId/cas",
            params
          })
        },
        {
          label: "Details"
        }
      ]
    };
  }
});
