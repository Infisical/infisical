import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { appConnectionKeys } from "../queries";

export type TAdcsCertificateTemplate = {
  name: string;
};

const adcsConnectionKeys = {
  all: [...appConnectionKeys.all, "adcs"] as const,
  listTemplates: (connectionId: string) =>
    [...adcsConnectionKeys.all, "templates", connectionId] as const
};

export const useAdcsConnectionListCertificateTemplates = (
  connectionId: string,
  options?: Omit<
    UseQueryOptions<
      TAdcsCertificateTemplate[],
      unknown,
      TAdcsCertificateTemplate[],
      ReturnType<typeof adcsConnectionKeys.listTemplates>
    >,
    "queryKey" | "queryFn"
  >
) => {
  return useQuery({
    queryKey: adcsConnectionKeys.listTemplates(connectionId),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ templates: TAdcsCertificateTemplate[] }>(
        `/api/v1/app-connections/adcs/${connectionId}/certificate-templates`
      );

      return data.templates;
    },
    ...options
  });
};
