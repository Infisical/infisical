import { apiRequest } from "@app/config/request";
import { useQuery } from "@tanstack/react-query";
import { TUserSecret } from "./types";

export const userSecretsKeys = {
  allUserSecrets: () => ["userSecrets"] as const,
};

export const useGetUserSecrets = () => {
  return useQuery({
    queryKey: userSecretsKeys.allUserSecrets(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ secrets: TUserSecret[]; }>(
        "/api/v1/user-secrets/",
      );

      console.log({ data });
      return data;
    }
  });
};
