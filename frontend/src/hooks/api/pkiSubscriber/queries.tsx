import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import { TCertificate } from "../certificates/types";
import { TPkiSubscriber } from "./types";

export const pkiSubscriberKeys = {
  getPkiSubscriber: ({
    subscriberName,
    projectId
  }: {
    subscriberName: string;
    projectId: string;
  }) => [{ subscriberName, projectId }, "pki-subscriber"] as const,
  allPkiSubscriberCertificates: () => ["pki-subscriber-certificates"] as const,
  forPkiSubscriberCertificates: ({
    subscriberName,
    projectId
  }: {
    subscriberName: string;
    projectId: string;
  }) => [...pkiSubscriberKeys.allPkiSubscriberCertificates(), projectId, subscriberName] as const,
  specificPkiSubscriberCertificates: ({
    subscriberName,
    projectId,
    offset,
    limit
  }: {
    subscriberName: string;
    projectId: string;
    offset: number;
    limit: number;
  }) =>
    [
      ...pkiSubscriberKeys.forPkiSubscriberCertificates({ subscriberName, projectId }),
      { offset, limit }
    ] as const
};

export const useGetPkiSubscriber = (
  {
    subscriberName,
    projectId
  }: {
    subscriberName: string;
    projectId: string;
  },
  options?: TReactQueryOptions["options"]
) => {
  return useQuery({
    queryKey: pkiSubscriberKeys.getPkiSubscriber({ subscriberName, projectId }),
    queryFn: async () => {
      const { data: pkiSubscriber } = await apiRequest.get<TPkiSubscriber>(
        `/api/v1/pki/subscribers/${subscriberName}`,
        { params: { projectId } }
      );
      return pkiSubscriber;
    },
    enabled: Boolean(subscriberName) && Boolean(projectId),
    ...options
  });
};

export const useGetPkiSubscriberCertificates = (
  {
    subscriberName,
    projectId,
    offset,
    limit
  }: {
    subscriberName: string;
    projectId: string;
    offset: number;
    limit: number;
  },
  options?: TReactQueryOptions["options"]
) => {
  return useQuery({
    queryKey: pkiSubscriberKeys.specificPkiSubscriberCertificates({
      subscriberName,
      projectId,
      offset,
      limit
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        projectId,
        offset: String(offset),
        limit: String(limit)
      });

      const {
        data: { certificates, totalCount }
      } = await apiRequest.get<{ certificates: TCertificate[]; totalCount: number }>(
        `/api/v1/pki/subscribers/${subscriberName}/certificates`,
        {
          params
        }
      );
      return { certificates, totalCount };
    },
    enabled: Boolean(subscriberName) && Boolean(projectId),
    ...options
  });
};
