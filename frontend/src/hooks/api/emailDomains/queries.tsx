import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TEmailDomain } from "./types";

export const emailDomainKeys = {
  list: (orgId: string) => [{ orgId }, "email-domains"] as const,
  all: ["email-domains"] as const
};

export const useGetEmailDomains = (orgId: string) => {
  return useQuery({
    queryKey: emailDomainKeys.list(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ emailDomains: TEmailDomain[] }>(
        "/api/v1/email-domains"
      );
      return data.emailDomains;
    },
    enabled: Boolean(orgId)
  });
};
