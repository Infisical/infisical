import { useSuspenseQuery } from "@tanstack/react-query";

import { userKeys } from "@app/hooks/api";
import { fetchUserDetails } from "@app/hooks/api/users/queries";

export const useUser = () => {
  const { data: user } = useSuspenseQuery({
    queryKey: userKeys.getUser,
    queryFn: fetchUserDetails,
    staleTime: Infinity
  });

  return { user };
};
