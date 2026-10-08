import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { createFileRoute, redirect } from "@tanstack/react-router";

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

    let isMember = true;
    try {
      await context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({ projectId }),
        queryFn: () => fetchUserProjectPermissions({ projectId })
      });
    } catch {
      isMember = false;
    }

    if (!isMember) {
      // The project is created with no members, so org admins join it here, as the home card does.
      const orgPermissions = await context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: params.orgId }),
        queryFn: () => fetchUserOrgPermissions({ orgId: params.orgId })
      });
      const orgAbility = createMongoAbility<OrgPermissionSet>(
        unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(orgPermissions.permissions),
        { conditionsMatcher }
      );

      if (
        orgAbility.can(
          OrgPermissionAdminConsoleAction.AccessAllProjects,
          OrgPermissionSubjects.AdminConsole
        )
      ) {
        try {
          await grantOrgAdminProjectAccess({ projectId });
          isMember = true;
        } catch {
          // Fall through to the list, where the admin can still join from All Projects.
        }
      }

      // The cached project list predates this join or a project created just now.
      await context.queryClient.invalidateQueries({ queryKey: projectKeys.allProjectQueries() });
    }

    if (isMember) {
      throw redirect({
        to: "/organizations/$orgId/projects/secret-scanning/$projectId/data-sources",
        params: { orgId: params.orgId, projectId }
      });
    }
  }
});
