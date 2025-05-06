import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPkiSubscriber } from "./types";

export const pkiSubscriberKeys = {
  getPkiSubscriberById: (subscriberId: string) => [{ subscriberId }, "pki-subscriber"] as const
};

export const useGetPkiSubscriberById = (subscriberId: string) => {
  return useQuery({
    queryKey: pkiSubscriberKeys.getPkiSubscriberById(subscriberId),
    queryFn: async () => {
      const { data: pkiSubscriber } = await apiRequest.get<TPkiSubscriber>(
        `/api/v1/pki/subscribers/${subscriberId}`
      );
      return pkiSubscriber;
    },
    enabled: Boolean(subscriberId)
  });
};
