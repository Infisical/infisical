import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshCaByIDPage } from "./SshCaByIDPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/ssh/$projectId/_ssh-layout/ca/$caId"
)({
  component: SshCaByIDPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "SSH Certificate Authorities",
          link: linkOptions({
            to: "/ssh/$projectId/overview",
            params: {
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});
