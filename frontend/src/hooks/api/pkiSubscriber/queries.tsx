import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { TReactQueryOptions } from "@app/types/reactQuery";

import { TCertificate } from "../certificates/types";
import { TPkiSubscriber } from "./types";

export const pkiSubscriberKeys = {
  getPkiSubscriber: ({ subscriberName }: { subscriberName: string }) =>
    [{ subscriberName }, "pki-subscriber"] as const,
  allPkiSubscriberCertificates: () => ["pki-subscriber-certificates"] as const,
  forPkiSubscriberCertificates: ({ subscriberName }: { subscriberName: string }) =>
    [...pkiSubscriberKeys.allPkiSubscriberCertificates(), subscriberName] as const,
  specificPkiSubscriberCertificates: ({
    subscriberName,
    offset,
    limit
  }: {
    subscriberName: string;
    offset: number;
    limit: number;
  }) =>
    [
      ...pkiSubscriberKeys.forPkiSubscriberCertificates({ subscriberName }),
      { offset, limit }
    ] as const
};

export const useGetPkiSubscriber = (
  {
    subscriberName
  }: {
    subscriberName: string;
  },
  options?: TReactQueryOptions["options"]
) => {
  return useQuery({
    queryKey: pkiSubscriberKeys.getPkiSubscriber({ subscriberName }),
    queryFn: async () => {
      const { data: pkiSubscriber } = await apiRequest.get<TPkiSubscriber>(
        `/api/v1/pki/subscribers/${subscriberName}`
      );
      return pkiSubscriber;
    },
    enabled: Boolean(subscriberName),
    ...options
  });
};

export const useGetPkiSubscriberCertificates = (
  {
    subscriberName,
    offset,
    limit
  }: {
    subscriberName: string;
    offset: number;
    limit: number;
  },
  options?: TReactQueryOptions["options"]
) => {
  return useQuery({
    queryKey: pkiSubscriberKeys.specificPkiSubscriberCertificates({
      subscriberName,
      offset,
      limit
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
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
    enabled: Boolean(subscriberName),
    ...options
  });
};
