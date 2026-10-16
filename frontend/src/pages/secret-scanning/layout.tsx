import { createFileRoute } from "@tanstack/react-router";

import { resolveSecretScanningProjectId } from "@app/helpers/secretScanningActiveProject";
import { projectKeys } from "@app/hooks/api";
import { fetchProjectById, fetchUserWorkspaces } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import {
  fetchSecretScanningProjectId,
  secretScanningV2Keys
} from "@app/hooks/api/secretScanningV2/queries";
import { SecretScanningLayout } from "@app/layouts/SecretScanningLayout";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/secret-scanning/_secret-scanning-layout"
)({
  component: SecretScanningLayout,
  beforeLoad: async ({ params, context }) => {
    const [activeProjectId, memberProjects] = await Promise.all([
      // Orgs get their project at creation, but orgs from before that have none until this creates it.
      context.queryClient.ensureQueryData<string>({
        queryKey: secretScanningV2Keys.activeProjectId(params.orgId),
        queryFn: fetchSecretScanningProjectId
      }),
      // fetchQuery rather than ensureQueryData: joining a project invalidates this list, and a stale
      // copy would ignore the earlier project the user just joined.
      context.queryClient.fetchQuery({
        queryKey: projectKeys.getAllUserProjects(),
        queryFn: () => fetchUserWorkspaces(),
        staleTime: 60_000
      })
    ]);

    const projectId =
      resolveSecretScanningProjectId({
        orgId: params.orgId,
        activeProjectId,
        memberProjectIds: memberProjects.map((p) => p.id)
      }) ?? activeProjectId;

    const [project] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: projectKeys.getProjectById(projectId),
        queryFn: () => fetchProjectById(projectId)
      }),
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
        queryFn: () => fetchUserProjectPermissions({ projectId })
      })
    ]);

    return {
      project,
      implicitProjectId: projectId,
      implicitProductType: ProjectType.SecretScanning,
      breadcrumbs: []
    };
  }
});
