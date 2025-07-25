import { createFileRoute, linkOptions, stripSearchParams } from "@tanstack/react-router";
import { zodValidator } from "@tanstack/zod-adapter";
import { z } from "zod";

import { SecretDashboardPathBreadcrumb } from "@app/components/navigation/SecretDashboardPathBreadcrumb";
import { BreadcrumbTypes } from "@app/components/v2";

import { RollbackPreviewTab } from "./RollbackPreviewTab";

const RollbackPreviewTabQueryParamsSchema = z.object({
  secretPath: z.string().catch("/")
});

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/projects/secret-management/$projectId/_secret-manager-layout/commits/$environment/$folderId/$commitId/restore"
)({
  component: RollbackPreviewTab,
  validateSearch: zodValidator(RollbackPreviewTabQueryParamsSchema),
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
              to: "/projects/secret-management/$projectId/secrets/$envSlug",
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
            to: "/projects/secret-management/$projectId/commits/$environment/$folderId",
            params: {
              projectId: params.projectId,
              environment: params.environment,
              folderId: params.folderId
            },
            search: {
              secretPath: search.secretPath
            }
          })
        },
        {
          label: params.commitId,
          link: linkOptions({
            to: "/projects/secret-management/$projectId/commits/$environment/$folderId/$commitId",
            params: {
              projectId: params.projectId,
              environment: params.environment,
              folderId: params.folderId,
              commitId: params.commitId
            },
            search: {
              secretPath: search.secretPath
            }
          })
        },
        {
          label: "Restore"
        }
      ]
    };
  }
});
