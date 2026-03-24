import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { useOrganization } from "@app/context";
import { orgIdentityQuery } from "@app/hooks/api/orgIdentity/queries";
import { projectIdentityQuery } from "@app/hooks/api/projectIdentity/queries";
import { projectKeys } from "@app/hooks/api/projects/query-keys";
import { fetchOrgUsers } from "@app/hooks/api/users/queries";
import { userKeys } from "@app/hooks/api/users/query-keys";
import { TWorkspaceUser } from "@app/hooks/api/users/types";

import { ActorType } from "./enums";

export type ActorSuggestion = { value: string; label: string; actorType: ActorType };

type UseAuditLogActorSuggestionsResult = {
  suggestions: ActorSuggestion[];
  isLoading: boolean;
};

const useScopedUsers = (orgId: string, projectId?: string, enabled = false) => {
  const { data: orgUsers = [], isLoading: isLoadingOrg } = useQuery({
    queryKey: userKeys.getOrgUsers(orgId),
    queryFn: () => fetchOrgUsers(orgId),
    enabled: enabled && !!orgId && !projectId
  });

  const { data: projectUsers = [], isLoading: isLoadingProject } = useQuery({
    queryKey: projectKeys.getProjectUsers(projectId ?? ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ users: TWorkspaceUser[] }>(
        `/api/v1/projects/${projectId}/users`
      );
      return data.users;
    },
    enabled: enabled && !!projectId
  });

  return {
    users: projectId ? projectUsers : orgUsers,
    isLoading: isLoadingOrg || isLoadingProject
  };
};

const useScopedIdentities = (projectId?: string, enabled = false) => {
  const { data: orgIdentities, isLoading: isLoadingOrg } = useQuery({
    ...orgIdentityQuery.list({ limit: 100 }),
    enabled: enabled && !projectId
  });

  const { data: projectIdentities, isLoading: isLoadingProject } = useQuery({
    ...projectIdentityQuery.list({ projectId: projectId ?? "", limit: 100 }),
    enabled: enabled && !!projectId
  });

  return {
    identities: projectId
      ? (projectIdentities?.identities ?? [])
      : (orgIdentities?.identities ?? []),
    isLoading: isLoadingOrg || isLoadingProject
  };
};

export const useAuditLogActorSuggestions = (
  actorType?: ActorType,
  enabled = false,
  projectId?: string
): UseAuditLogActorSuggestionsResult => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";

  const isUserType = !actorType || actorType === ActorType.USER;
  const isIdentityType = !actorType || actorType === ActorType.IDENTITY;

  const { users, isLoading: isLoadingUsers } = useScopedUsers(
    orgId,
    projectId,
    enabled && isUserType
  );
  const { identities, isLoading: isLoadingIdentities } = useScopedIdentities(
    projectId,
    enabled && isIdentityType
  );

  const suggestions = useMemo<ActorSuggestion[]>(() => {
    const userSuggestions = users.map((u) => ({
      label: `${u.user.email || u.user.username} (${u.user.id})`,
      value: u.user.id,
      actorType: ActorType.USER as const
    }));
    const identitySuggestions = identities.map((identity) => ({
      label: `${identity.name} (${identity.id})`,
      value: identity.id,
      actorType: ActorType.IDENTITY as const
    }));

    switch (actorType) {
      case undefined:
        return [...userSuggestions, ...identitySuggestions];
      case ActorType.USER:
        return userSuggestions;
      case ActorType.IDENTITY:
        return identitySuggestions;
      default:
        return [];
    }
  }, [actorType, users, identities]);

  return { suggestions, isLoading: isLoadingUsers || isLoadingIdentities };
};
