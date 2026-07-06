import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import {
  PamAccessControlPage,
  PamAccessControlTab
} from "@app/pages/pam/PamAccessControlPage/PamAccessControlPage";

const PamAccessControlQuerySchema = z.object({
  selectedTab: z.nativeEnum(PamAccessControlTab).catch(PamAccessControlTab.Members),
  requesterEmail: z.string().catch("")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/pam/_pam-layout/access-management"
)({
  component: PamAccessControlPage,
  validateSearch: zodValidator(PamAccessControlQuerySchema),
  search: {
    middlewares: [stripSearchParams({ requesterEmail: "" })]
  },
  beforeLoad: ({ context }) => {
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Access Control"
        }
      ]
    };
  }
});
