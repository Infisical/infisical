import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { ApplicationTab } from "./application-tabs";
import { ApplicationDetailsByIDPage } from "./ApplicationDetailsByIDPage";

const ApplicationTabSchema = z.nativeEnum(ApplicationTab);

const SearchSchema = z.object({
  selectedTab: ApplicationTabSchema.optional(),
  search: z.string().optional()
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout/applications/$applicationName"
)({
  component: ApplicationDetailsByIDPage,
  validateSearch: zodValidator(SearchSchema),
  search: { middlewares: [stripSearchParams({ selectedTab: ApplicationTab.Certificates })] },
  beforeLoad: ({ context, params }) => ({
    breadcrumbs: [
      ...context.breadcrumbs,
      {
        label: "Applications",
        link: linkOptions({
          to: "/organizations/$orgId/cert-manager/applications",
          params: { orgId: params.orgId }
        })
      },
      { label: "Application" }
    ]
  })
});
