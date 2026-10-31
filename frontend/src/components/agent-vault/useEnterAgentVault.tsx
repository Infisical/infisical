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
import { useGetUserProjects, useRequestProjectAccess } from "@app/hooks/api";
import { fetchAgentVaultProjectId } from "@app/hooks/api/agentVault/queries";
import { useOrgAdminAccessProject } from "@app/hooks/api/orgAdmin/mutation";
import { Project, ProjectType } from "@app/hooks/api/projects/types";

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
  const requestProjectAccess = useRequestProjectAccess();
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
  // Matched by type, not by currentOrg.agentVaultProjectId: the org can be cached from before its
  // Agent Vault project existed, and there is only one Agent Vault project per org.
  const isAgentVaultMember = projects.some((p) => p.type === ProjectType.AgentVault);
  const needsAccessRequest = !isAgentVaultMember && !isOrgAdmin && canRequestAccess;

  const navigateToAgentVault = () => {
    navigate({
      to: "/organizations/$orgId/agent-vault",
      params: { orgId: currentOrg?.id ?? "" }
    });
  };

  const resolveAgentVaultProjectId = async () => {
    try {
      return currentOrg?.agentVaultProjectId ?? (await fetchAgentVaultProjectId());
    } catch (err) {
      createNotification({
        type: "error",
        text: err instanceof Error ? err.message : "Failed to resolve the Agent Vault project."
      });
      return null;
    }
  };

  const resolveOutcome = async (): Promise<TEnterAgentVaultOutcome> => {
    const agentVaultProjectId = await resolveAgentVaultProjectId();
    if (!agentVaultProjectId) return "blocked";

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

  // Sends the request with no note, for entry points that skip the request dialog.
  const requestAgentVaultAccess = async () => {
    setIsEntering(true);
    try {
      const agentVaultProjectId = await resolveAgentVaultProjectId();
      if (!agentVaultProjectId) return false;
      if (projects.some((p) => p.id === agentVaultProjectId)) {
        navigateToAgentVault();
        return true;
      }
      await requestProjectAccess.mutateAsync({ projectId: agentVaultProjectId });
      createNotification({
        type: "success",
        title: "Access Request Sent",
        text: "Admins will receive an email of your request"
      });
      return true;
    } catch {
      // The global mutation error handler already reports the failure.
      return false;
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

  return {
    enterAgentVault,
    requestAgentVaultAccess,
    needsAccessRequest,
    isEntering,
    agentVaultAccessRequest
  };
};
