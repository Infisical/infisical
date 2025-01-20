import { createFileRoute, linkOptions } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ProjectAccessControlTabs } from "@app/types/project";

import { AccessControlPage } from "./AccessControlPage";

const AccessControlPageQuerySchema = z.object({
  selectedTab: z.nativeEnum(ProjectAccessControlTabs).catch(ProjectAccessControlTabs.Member)
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/cert-manager/$projectId/_cert-manager-layout/access-management"
)({
  component: AccessControlPage,
  validateSearch: zodValidator(AccessControlPageQuerySchema),
  beforeLoad: ({ context, params }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control",
          link: linkOptions({
            to: "/cert-manager/$projectId/access-management",
            params: {
              projectId: params.projectId
            }
          })
        }
      ]
    };
  }
});
