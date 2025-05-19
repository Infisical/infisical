import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectAccessControlTabs } from "@app/types/project";

import { AccessControlPage } from "./AccessControlPage";

const AccessControlPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(ProjectAccessControlTabs).catch(ProjectAccessControlTabs.Member),
  requesterEmail: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/secret-scanning/$projectId/_secret-scanning-layout/access-management"
)({
  component: AccessControlPage,
  validateSearch: zodValidator(AccessControlPageQuerySchema),
  search: {
    middlewares: [stripSearchParams({ requesterEmail: "" })]
  },
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/secret-scanning/$projectId/access-management",
            params: {
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});
