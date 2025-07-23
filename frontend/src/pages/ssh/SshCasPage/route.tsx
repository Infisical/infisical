import { createFileRoute, linkOptions } from "@tanstack/react-router";

import { SshCasPage } from "./SshCasPage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/ssh/$projectId/_ssh-layout/cas"
)({
  component: SshCasPage,
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Certificate Authorities",
          link: linkOptions({
            to: "/projects/ssh/$projectId/cas",
            params
          })
        }
      ]
    };
  }
});
