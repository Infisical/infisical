import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

export const automatedSecurityKeys = {
  getReports: (orgId: string) => [{ orgId }, "organization-security-reports"] as const
};

export const useGetAutomatedSecurityReports = (orgId: string) => {
  return useQuery({
    queryKey: automatedSecurityKeys.getReports(orgId),
    queryFn: async () => {
      const { data } = await apiRequest.get<
        {
          id: string;
          profileId: string;
          event: string;
          remarks: string;
          severity: string;
          status: string;
          userId: string;
          name: string;
        }[]
      >("/api/v1/automated-security/reports");

      return data;
    }
  });
};
