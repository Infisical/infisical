import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPkiCollection } from "./types";

export const pkiCollectionKeys = {
  getPkiCollectionById: (collectionId: string) => [{ collectionId }, "pki-collection"]
};

export const useGetPkiCollectionById = (collectionId: string) => {
  return useQuery({
    queryKey: pkiCollectionKeys.getPkiCollectionById(collectionId),
    queryFn: async () => {
      const { data: pkiCollection } = await apiRequest.get<TPkiCollection>(
        `/api/v1/pki/collections/${collectionId}`
      );
      return pkiCollection;
    },
    enabled: Boolean(collectionId)
  });
};
