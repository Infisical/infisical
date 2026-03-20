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

type ActorSuggestion = { value: string; label: string };

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
  const isIdentityType = actorType === ActorType.IDENTITY;

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
    switch (actorType) {
      case ActorType.IDENTITY:
        return identities.map((identity) => ({
          label: `${identity.name} (${identity.id})`,
          value: identity.id
        }));
      case undefined:
      case ActorType.USER:
        return users.map((u) => ({
          label: `${u.user.email || u.user.username} (${u.user.id})`,
          value: u.user.id
        }));
      default:
        return [];
    }
  }, [actorType, users, identities]);

  return { suggestions, isLoading: isLoadingUsers || isLoadingIdentities };
};
