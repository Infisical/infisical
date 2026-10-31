import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";

import { createNotification } from "@app/components/notifications";
import { RequestProjectAccessModal } from "@app/components/projects/RequestProjectAccessModal";
import { useOrganization, useOrgPermission } from "@app/context";
import {
  OrgPermissionAdminConsoleAction,
  OrgPermissionProjectActions,
  OrgPermissionSubjects
} from "@app/context/OrgPermissionContext/types";
import { useGetUserProjects } from "@app/hooks/api";
import { fetchAgentVaultProjectId } from "@app/hooks/api/agentVault/queries";
import { useOrgAdminAccessProject } from "@app/hooks/api/orgAdmin/mutation";
import { Project } from "@app/hooks/api/projects/types";

export type TEnterAgentVaultOutcome = "entered" | "requesting-access" | "blocked";

// The Agent Vault layout rejects anyone who is not a member of the org's Agent Vault project (org
// admins excepted), and that project starts with no members, so every entry point goes through
// here instead of navigating straight to the route.
export const useEnterAgentVault = () => {
  const navigate = useNavigate();
  const { currentOrg } = useOrganization();
  const { permission } = useOrgPermission();
  const { data: projects = [] } = useGetUserProjects();
  const orgAdminAccessProject = useOrgAdminAccessProject();
  const [isEntering, setIsEntering] = useState(false);
  const [requestAccessProjectId, setRequestAccessProjectId] = useState<string | null>(null);

  const isOrgAdmin = permission.can(
    OrgPermissionAdminConsoleAction.AccessAllProjects,
    OrgPermissionSubjects.AdminConsole
  );
  const canRequestAccess = permission.can(
    OrgPermissionProjectActions.RequestAccess,
    OrgPermissionSubjects.Project
  );

  const navigateToAgentVault = () => {
    navigate({
      to: "/organizations/$orgId/agent-vault",
      params: { orgId: currentOrg?.id ?? "" }
    });
  };

  const resolveOutcome = async (): Promise<TEnterAgentVaultOutcome> => {
    let agentVaultProjectId: string;
    try {
      agentVaultProjectId = currentOrg?.agentVaultProjectId ?? (await fetchAgentVaultProjectId());
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to resolve the Agent Vault project."
      });
      return "blocked";
    }

    if (projects.some((p) => p.id === agentVaultProjectId)) {
      navigateToAgentVault();
      return "entered";
    }

    if (isOrgAdmin) {
      try {
        await orgAdminAccessProject.mutateAsync({ projectId: agentVaultProjectId });
        navigateToAgentVault();
        return "entered";
      } catch (err) {
        createNotification({
          type: "error",
          text: err instanceof Error ? err.message : "Failed to join the Agent Vault project."
        });
        return "blocked";
      }
    }

    if (canRequestAccess) {
      setRequestAccessProjectId(agentVaultProjectId);
      return "requesting-access";
    }

    createNotification({
      type: "error",
      text: "You don't have access to Agent Vault. Ask an Agent Vault admin to add you."
    });
    return "blocked";
  };

  const enterAgentVault = async () => {
    setIsEntering(true);
    try {
      return await resolveOutcome();
    } finally {
      setIsEntering(false);
    }
  };

  const agentVaultAccessRequest = (
    <RequestProjectAccessModal
      isOpen={Boolean(requestAccessProjectId)}
      onOpenChange={(isOpen) => {
        if (!isOpen) setRequestAccessProjectId(null);
      }}
      project={
        requestAccessProjectId
          ? ({ id: requestAccessProjectId, name: "Agent Vault" } as Project)
          : undefined
      }
      subTitle="Requesting access to Agent Vault. You may include an optional note for admins to review your request."
    />
  );

  return { enterAgentVault, isEntering, agentVaultAccessRequest };
};
