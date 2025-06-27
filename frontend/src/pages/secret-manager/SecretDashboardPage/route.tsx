import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretDashboardPathBreadcrumb } from "@app/components/navigation/SecretDashboardPathBreadcrumb";
import { BreadcrumbTypes } from "@app/components/v2";

import { SecretDashboardPage } from "./SecretDashboardPage";

const SecretDashboardPageQueryParamsSchema = z.object({
  secretPath: z.string().catch("/"),
  search: z.string().catch(""),
  tags: z.string().catch("")
});
export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/secrets/$envSlug"
)({
  component: SecretDashboardPage,
  validateSearch: zodValidator(SecretDashboardPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ secretPath: "/", search: "", tags: "" })]
  },
  beforeLoad: ({ context, params, search }) => {
    const secretPathSegments = search.secretPath.split("/").filter(Boolean);
    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          label: "Secrets",
          link: linkOptions({
            to: "/projects/$projectId/secret-manager/overview",
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
              to: "/projects/$projectId/secret-manager/secrets/$envSlug",
              params: {
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
