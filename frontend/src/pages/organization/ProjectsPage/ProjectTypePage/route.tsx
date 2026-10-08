import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { createFileRoute, redirect } from "@tanstack/react-router";
import axios from "axios";

import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { urlSlugToProjectType } from "@app/helpers/project";
import { projectKeys } from "@app/hooks/api";
import { grantOrgAdminProjectAccess } from "@app/hooks/api/orgAdmin";
import { ProjectType } from "@app/hooks/api/projects/types";
import { conditionsMatcher } from "@app/hooks/api/roles/permission-matcher";
import {
  fetchUserOrgPermissions,
  fetchUserProjectPermissions,
  roleQueryKeys
} from "@app/hooks/api/roles/queries";
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

    // Secret Scanning has one active project per org, so members skip the list. Resolving can create the
    // project, which the cached project list cannot know about yet, so access is decided by loading the
    // user's permissions on it, as the PAM layout does.
    let projectId: string;
    try {
      projectId = await context.queryClient.fetchQuery({
        queryKey: secretScanningV2Keys.activeProjectId(params.orgId),
        queryFn: fetchSecretScanningProjectId
      });
    } catch {
      return;
    }

    const toProject = redirect({
      to: "/organizations/$orgId/projects/secret-scanning/$projectId/data-sources",
      params: { orgId: params.orgId, projectId }
    });

    try {
      await context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
        queryFn: () => fetchUserProjectPermissions({ projectId }),
        retry: false
      });
    } catch (err) {
      // Only a missing membership leads to a join: grant-admin-access replaces an existing member's
      // roles with Admin, so any other failure must stay an error.
      const isNotAMember =
        axios.isAxiosError(err) && err.response?.data?.error === "ProjectMembershipNotFound";
      if (!isNotAMember) throw err;

      const orgPermissions = await context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: params.orgId }),
        queryFn: () => fetchUserOrgPermissions({ orgId: params.orgId })
      });
      const orgAbility = createMongoAbility<OrgPermissionSet>(
        unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(orgPermissions.permissions),
        { conditionsMatcher }
      );
      const isOrgAdmin = orgAbility.can(
        OrgPermissionAdminConsoleAction.AccessAllProjects,
        OrgPermissionSubjects.AdminConsole
      );

      // Org admins promoted after the project was created are not seeded into it, so they join here, as
      // the home card does. Everyone else stays on the list to request access.
      if (isOrgAdmin) await grantOrgAdminProjectAccess({ projectId });

      // The cached project list predates this join or a project created just now.
      await context.queryClient.invalidateQueries({ queryKey: projectKeys.allProjectQueries() });

      if (!isOrgAdmin) return;
    }

    throw toProject;
  }
});
