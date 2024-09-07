import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TUserCredential } from "./types";

// TODO(@srijan): paginate the results with offset+limit query params
export const useGetCredentials = () => {
  return useQuery({
    queryFn: async () => {
      const { data } = await apiRequest.get<{ credentials: TUserCredential[] }>(
        "/api/v1/user-credential", {}
      );
      return data;
    },
  })
}

