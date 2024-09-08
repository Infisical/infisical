import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserCredential } from "./types";

export const queryKeys = {
  getCredentials: ["credentials"],
}

// TODO(@srijan): paginate the results with offset+limit query params
export const useGetCredentials = () => {
  return useQuery({
    queryKey: queryKeys.getCredentials,
    queryFn: async () => {
      const { data } = await apiRequest.get<{ credentials: TUserCredential[] }>(
        "/api/v1/user-credential", {}
      );
      return data;
    },
  })
}

