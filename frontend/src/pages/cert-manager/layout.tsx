import { createFileRoute, redirect } from "@tanstack/react-router";

import {
  resolveCertManagerProjectId,
  setCertManagerActiveProjectCookie
} from "@app/helpers/certManagerActiveProject";
import { projectKeys } from "@app/hooks/api";
import {
  certManagerInstanceKeys,
  fetchCertManagerInstanceState
} from "@app/hooks/api/certManagerInstance";
import { fetchProjectById, fetchUserWorkspaces } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { fetchUserProjectPermissions, roleQueryKeys } from "@app/hooks/api/roles/queries";
import { PkiManagerLayout } from "@app/layouts/PkiManagerLayout";

// Several Certificate Manager queries are not keyed by project, so moving to another instance within
// one page load would show the previous instance's cached data. A full load starts from a clean cache.
const resolvedProjectIdByOrg = new Map<string, string>();

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/cert-manager/_cert-manager-layout"
)({
  component: PkiManagerLayout,
  beforeLoad: async ({ params, context, location }) => {
    const [instance, memberProjects] = await Promise.all([
      context.queryClient.ensureQueryData({
        queryKey: certManagerInstanceKeys.state(params.orgId),
        queryFn: fetchCertManagerInstanceState
      }),
      // fetchQuery rather than ensureQueryData: joining a project invalidates this list, and a stale
      // copy would ignore the instance the user just joined.
      context.queryClient.fetchQuery({
        queryKey: projectKeys.getAllUserProjects(),
        queryFn: () => fetchUserWorkspaces(),
        staleTime: 60_000
      })
    ]);

    const projectId = resolveCertManagerProjectId({
      orgId: params.orgId,
      activeProjectId: instance.activeProjectId,
      memberProjectIds: memberProjects.map((p) => p.id)
    });

    if (!projectId) {
      // The product landing page explains how to set Certificate Manager up.
      throw redirect({
        to: "/organizations/$orgId/projects/$type",
        params: { orgId: params.orgId, type: "cert-manager" }
      });
    }

    // Requests that name no project resolve from this cookie on the backend, so keep it on the
    // project the UI is showing, including when a stale or inaccessible one was ignored above.
    setCertManagerActiveProjectCookie(params.orgId, projectId);

    const previousProjectId = resolvedProjectIdByOrg.get(params.orgId);
    resolvedProjectIdByOrg.set(params.orgId, projectId);
    if (previousProjectId && previousProjectId !== projectId) {
      throw redirect({ href: location.href, reloadDocument: true });
    }

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
      implicitProductType: ProjectType.CertificateManager,
      breadcrumbs: []
    };
  }
});
