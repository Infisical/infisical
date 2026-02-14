import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";
import { TTerraformCloudOrganization } from "./types";

const terraformCloudConnectionKeys = {
  all: [...appConnectionKeys.all, "terraform-cloud"] as const,
  listOrganizations: (connectionId: string) =>
    [...terraformCloudConnectionKeys.all, "organizations", connectionId] as const
};

export const useTerraformCloudConnectionListOrganizations = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TTerraformCloudOrganization[],
      unknown,
      TTerraformCloudOrganization[],
      ReturnType<typeof terraformCloudConnectionKeys.listOrganizations>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: terraformCloudConnectionKeys.listOrganizations(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<TTerraformCloudOrganization[]>(
        `/api/v1/app-connections/terraform-cloud/${connectionId}/organizations`,
        {}
      );

      return data;
    },
    ...options
  });
};
