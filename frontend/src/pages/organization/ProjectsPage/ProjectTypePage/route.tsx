import { createFileRoute, redirect } from "@tanstack/react-router";

import { urlSlugToProjectType } from "@app/helpers/project";
import { projectKeys } from "@app/hooks/api";
import { ProjectType } from "@app/hooks/api/projects/types";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import {
  fetchSecretScanningProjectId,
  secretScanningV2Keys
} from "@app/hooks/api/secretScanningV2/queries";

import { ProjectTypePage } from "./ProjectTypePage";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/projects/$type"
)({
  component: ProjectTypePage,
  context: () => ({
    breadcrumbs: [
      {
        label: "Projects"
      }
    ]
  }),
  beforeLoad: async ({ params, context }) => {
    const projectType = urlSlugToProjectType(params.type);
    if (!projectType) {
      throw redirect({
        to: "/organizations/$orgId/projects",
        params: { orgId: params.orgId }
      });
    }

    if (projectType !== ProjectType.SecretScanning) return;

    // Secret Scanning has one active project per org, so members skip the list. Resolving can create
    // the project and its memberships, which the cached project list cannot know about yet, so access
    // is decided by loading the user's permissions on it, as the PAM layout does.
    let projectId: string;
    try {
      projectId = await context.queryClient.fetchQuery({
        queryKey: secretScanningV2Keys.activeProjectId(params.orgId),
        queryFn: fetchSecretScanningProjectId
      });
    } catch {
      return;
    }

    let isMember = true;
    try {
      await context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
        queryFn: () => fetchUserProjectPermissions({ projectId })
      });
    } catch {
      isMember = false;
    }

    if (isMember) {
      throw redirect({
        to: "/organizations/$orgId/projects/secret-scanning/$projectId/data-sources",
        params: { orgId: params.orgId, projectId }
      });
    }

    // Non-members land on the list to request access, which has to include a project created just now.
    await context.queryClient.invalidateQueries({ queryKey: projectKeys.allProjectQueries() });
  }
});
