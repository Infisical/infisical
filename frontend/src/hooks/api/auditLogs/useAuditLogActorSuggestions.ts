import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { useOrganization } from "@app/context";
import { orgIdentityQuery } from "@app/hooks/api/orgIdentity/queries";
import { fetchOrgUsers } from "@app/hooks/api/users/queries";
import { userKeys } from "@app/hooks/api/users/query-keys";

import { ActorType } from "./enums";

type ActorSuggestion = { value: string; label: string };

type UseAuditLogActorSuggestionsResult = {
  suggestions: ActorSuggestion[];
  isLoading: boolean;
};

export const useAuditLogActorSuggestions = (
  actorType?: ActorType,
  enabled = false
): UseAuditLogActorSuggestionsResult => {
  const { currentOrg } = useOrganization();
  const orgId = currentOrg?.id ?? "";

  const { data: orgUsers = [], isLoading: isLoadingUsers } = useQuery({
    queryKey: userKeys.getOrgUsers(orgId),
    queryFn: () => fetchOrgUsers(orgId),
    enabled: enabled && Boolean(orgId) && (!actorType || actorType === ActorType.USER)
  });

  const { data: orgIdentities, isLoading: isLoadingIdentities } = useQuery({
    ...orgIdentityQuery.list({ limit: 100 }),
    enabled: enabled && actorType === ActorType.IDENTITY
  });

  const suggestions = useMemo<ActorSuggestion[]>(() => {
    switch (actorType) {
      case ActorType.IDENTITY:
        return (orgIdentities?.identities ?? []).map((identity) => ({
          label: `${identity.name} (${identity.id})`,
          value: identity.id
        }));
      case undefined:
      case ActorType.USER:
        return orgUsers.map((orgUser) => ({
          label: `${orgUser.user.email || orgUser.user.username} (${orgUser.user.id})`,
          value: orgUser.user.id
        }));
      default:
        return [];
    }
  }, [actorType, orgUsers, orgIdentities]);

  return { suggestions, isLoading: isLoadingIdentities || isLoadingUsers };
};
