import { createMongoAbility, MongoAbility, RawRuleOf } from "@casl/ability";
import { unpackRules } from "@casl/ability/extra";
import { createFileRoute, redirect } from "@tanstack/react-router";
import axios from "axios";

import { BreadcrumbTypes } from "@app/components/v2";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionSet,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { projectKeys } from "@app/hooks/api";
import { fetchAgentVaultProjectId } from "@app/hooks/api/agentVault/queries";
import { grantOrgAdminProjectAccess } from "@app/hooks/api/orgAdmin";
import { organizationKeys } from "@app/hooks/api/organization/queries";
import { Organization } from "@app/hooks/api/organization/types";
import { fetchProjectById } from "@app/hooks/api/projects/queries";
import { ProjectType } from "@app/hooks/api/projects/types";
import { conditionsMatcher } from "@app/hooks/api/roles/permission-matcher";
import {
  fetchUserOrgPermissions,
  fetchUserProjectPermissions,
  roleQueryKeys
} from "@app/hooks/api/roles/queries";
import { AgentVaultLayout } from "@app/layouts/AgentVaultLayout";
import { ProjectSelect } from "@app/layouts/ProjectLayout/components/ProjectSelect";

export const Route = createFileRoute(
  "/_authenticate/_inject-org-details/_org-layout/organizations/$orgId/agent-vault/_agent-vault-layout"
)({
  component: AgentVaultLayout,
  beforeLoad: async ({ params, context }) => {
    const org = context.queryClient.getQueryData<Organization>(
      organizationKeys.getOrgById(params.orgId)
    );

    let agentVaultProjectId = org?.agentVaultProjectId;
    if (!agentVaultProjectId) {
      // Patch the returned id into the cached org so the Project contexts pick it up, without a refetch
      // that could race read-replica lag.
      const resolvedAgentVaultProjectId = await fetchAgentVaultProjectId();
      agentVaultProjectId = resolvedAgentVaultProjectId;
      context.queryClient.setQueryData<Organization>(
        organizationKeys.getOrgById(params.orgId),
        (old) => (old ? { ...old, agentVaultProjectId: resolvedAgentVaultProjectId } : old)
      );
    }

    if (!agentVaultProjectId) {
      throw redirect({ to: "/organizations/$orgId/projects", params: { orgId: params.orgId } });
    }

    // The project is bootstrapped with no members, so an org admin arriving by link (not the product tile,
    // which joins them itself) is not a member yet. Join them here rather than showing the error page.
    const loadPermissions = () =>
      context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserProjectPermissions({ projectId: agentVaultProjectId }),
        queryFn: () => fetchUserProjectPermissions({ projectId: agentVaultProjectId }),
        retry: false
      });
    const isNotAMember = (err: unknown) =>
      axios.isAxiosError(err) && err.response?.data?.error === "ProjectMembershipNotFound";
    const isOrgAdmin = async () => {
      const orgPermissions = await context.queryClient.ensureQueryData({
        queryKey: roleQueryKeys.getUserOrgPermissions({ orgId: params.orgId }),
        queryFn: () => fetchUserOrgPermissions({ orgId: params.orgId })
      });
      const ability = createMongoAbility<OrgPermissionSet>(
        unpackRules<RawRuleOf<MongoAbility<OrgPermissionSet>>>(orgPermissions.permissions),
        { conditionsMatcher }
      );
      return ability.can(
        OrgPermissionAdminConsoleAction.AccessAllProjects,
        OrgPermissionSubjects.AdminConsole
      );
    };

    try {
      await loadPermissions();
    } catch (err) {
      if (!isNotAMember(err) || !(await isOrgAdmin())) throw err;
      await grantOrgAdminProjectAccess({ projectId: agentVaultProjectId });
      await context.queryClient.invalidateQueries({ queryKey: projectKeys.allProjectQueries() });
      await loadPermissions();
    }

    await context.queryClient.ensureQueryData({
      queryKey: projectKeys.getProjectById(agentVaultProjectId),
      queryFn: () => fetchProjectById(agentVaultProjectId)
    });

    return {
      implicitProjectId: agentVaultProjectId,
      implicitProductType: ProjectType.AgentVault,
      breadcrumbs: [{ type: BreadcrumbTypes.Component, component: ProjectSelect }]
    };
  }
});
