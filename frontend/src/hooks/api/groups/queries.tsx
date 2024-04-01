import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export const groupKeys = {
  getGroupUserMembership: (slug: string) => [{ slug }, "group-user-memberships"] as const
};

type TUser = {
  id: string;
  email: string;
  username: string;
  firstName: string;
  lastName: string;
  isPartOfGroup: boolean;
};

export const useListGroupUsers = (groupSlug: string) => {
  return useQuery({
    queryKey: groupKeys.getGroupUserMembership(groupSlug),
    enabled: Boolean(groupSlug),
    queryFn: async () => {
      const { data: users } = await apiRequest.get<TUser[]>(`/api/v1/groups/${groupSlug}/users`);

      return users;
    }
  });
};
