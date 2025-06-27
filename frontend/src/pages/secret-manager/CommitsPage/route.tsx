/* eslint-disable @typescript-eslint/no-unused-vars */
import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretDashboardPathBreadcrumb } from "@app/components/navigation/SecretDashboardPathBreadcrumb";
import { BreadcrumbTypes } from "@app/components/v2";

import { CommitsPage } from "./CommitsPage";

const CommitsPageQueryParamsSchema = z.object({
  secretPath: z.string().catch("/")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/$projectId/_project-layout/secret-manager/_secret-manager-layout/commits/$environment/$folderId/"
)({
  component: CommitsPage,
  validateSearch: zodValidator(CommitsPageQueryParamsSchema),
  search: {
    middlewares: [stripSearchParams({ secretPath: "/" })]
  },
  beforeLoad: ({ context, params, search }) => {
    const secretPathSegments = search.secretPath.split("/").filter(Boolean);

    return {
      breadcrumbs: [
        ...context.breadcrumbs,
        {
          type: BreadcrumbTypes.Dropdown,
          label:
            context.project.environments.find((el) => el.slug === params.environment)?.name || "",
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
              environmentSlug={params.environment}
              projectId={params.projectId}
              disableCopy
            />
          )
        })),
        {
          label: "Commits",
          link: linkOptions({
            to: "/projects/$projectId/secret-manager/commits/$environment/$folderId",
            params: {
              projectId: params.projectId,
              environment: params.environment,
              folderId: params.folderId
            }
          })
        }
      ]
    };
  }
});
