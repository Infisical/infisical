import { useQuery, UseQueryOptions } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { PamDomainType } from "./enums";
import { TListPamDomainsDTO, TPamDomain, TPamDomainRelatedResource } from "./types";

export const pamDomainKeys = {
  all: ["pam-domain"] as const,
  domain: () => [...pamDomainKeys.all, "domain"] as const,
  listDomainOptions: () => [...pamDomainKeys.domain(), "options"] as const,
  listDomains: ({ projectId, ...params }: TListPamDomainsDTO) => [
    ...pamDomainKeys.domain(),
    "list",
    projectId,
    params
  ],
  getDomain: (domainType: string, domainId: string) => [
    ...pamDomainKeys.domain(),
    "get",
    domainType,
    domainId
  ],
  listRelatedResources: (domainId: string) => [...pamDomainKeys.domain(), "related", domainId]
};

export const useListPamDomainOptions = () => {
  return useQuery({
    queryKey: pamDomainKeys.listDomainOptions(),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        options: Array<{ name: string; domain: string }>;
      }>("/api/v1/pam/domains/options");

      return data.options;
    }
  });
};

export const useListPamDomains = (params: TListPamDomainsDTO) => {
  return useQuery({
    queryKey: pamDomainKeys.listDomains(params),
    queryFn: async () => {
      const { data } = await apiRequest.get<{
        domains: TPamDomain[];
        totalCount: number;
      }>("/api/v1/pam/domains", { params });
      return data;
    },
    enabled: !!params.projectId
  });
};

export const useGetPamDomainById = (
  domainType: PamDomainType | string,
  domainId: string | undefined,
  options?: Omit<UseQueryOptions<TPamDomain>, "queryKey" | "queryFn">
) => {
  return useQuery({
    queryKey: pamDomainKeys.getDomain(domainType, domainId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ domain: TPamDomain }>(
        `/api/v1/pam/domains/${domainType}/${domainId}`
      );
      return data.domain;
    },
    enabled: !!domainId && !!domainType,
    ...options
  });
};

export const useListDomainRelatedResources = (
  domainType: PamDomainType | string,
  domainId: string | undefined,
  options?: Omit<UseQueryOptions<TPamDomainRelatedResource[]>, "queryKey" | "queryFn">
) => {
  return useQuery({
    queryKey: pamDomainKeys.listRelatedResources(domainId || ""),
    queryFn: async () => {
      const { data } = await apiRequest.get<{ resources: TPamDomainRelatedResource[] }>(
        `/api/v1/pam/domains/${domainType}/${domainId}/related-resources`
      );
      return data.resources;
    },
    enabled: !!domainId && !!domainType,
    ...options
  });
};
