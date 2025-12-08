import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretDashboardPathBreadcrumb } from "@app/components/navigation/SecretDashboardPathBreadcrumb";
import { BreadcrumbTypes } from "@app/components/v2";

import { SecretDashboardPage } from "./SecretDashboardPage";

const SecretDashboardPageQueryParamsSchema = z.object({
  secretPath: z.string().catch("/"),
  search: z.string().catch(""),
  tags: z.string().catch(""),
  filterBy: z.string().catch(""),
  dynamicSecretId: z.string().catch(""),
  connectionId: z.string().optional(),
  connectionName: z.string().optional()
});
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/secret-management/$projectId/_secret-manager-layout/secrets/$envSlug"
)({
  component: SecretDashboardPage,
  validateSearch: zodValidator(SecretDashboardPageQueryParamsSchema),
  search: {
    middlewares: [
      stripSearchParams({
        secretPath: "/",
        search: "",
        tags: "",
        filterBy: "",
        dynamicSecretId: ""
      })
    ]
  },
  beforeLoad: ({ context, params, search }) => {
    const secretPathSegments = search.secretPath.split("/").filter(Boolean);
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Secrets",
          link: linkOptions({
            to: "/organizations/$orgId/projects/secret-management/$projectId/overview",
            params
          })
        },
        {
          type: BreadcrumbTypes.Dropdown,
          label: context.project.environments.find((el) => el.slug === params.envSlug)?.name || "",
          dropdownTitle: "Environments",
          links: context.project.environments.map((el) => ({
            label: el.name,
            link: linkOptions({
              to: "/organizations/$orgId/projects/secret-management/$projectId/secrets/$envSlug",
              params: {
                orgId: params.orgId,
                projectId: params.projectId,
                envSlug: el.slug
              }
            })
          }))
        },
        ...secretPathSegments.map((_, index) => ({
          type: BreadcrumbTypes.Component,
          component: () => (
            <SecretDashboardPathBreadcrumb
              secretPathSegments={secretPathSegments}
              selectedPathSegmentIndex={index}
              environmentSlug={params.envSlug}
              projectId={params.projectId}
            />
          )
        }))
      ]
    };
  }
});
