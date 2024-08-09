import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { TPkiCollection, TPkiCollectionItem } from "./types";

export const pkiCollectionKeys = {
  getPkiCollectionById: (collectionId: string) => [{ collectionId }, "pki-collection"] as const,
  getPkiCollectionItems: (collectionId: string) =>
    [{ collectionId }, "pki-collection-items"] as const,
  specificPkiCollectionItems: ({
    collectionId,
    offset,
    limit
  }: {
    collectionId: string;
    offset: number;
    limit: number;
  }) =>
    [
      ...pkiCollectionKeys.getPkiCollectionItems(collectionId),
      { offset, limit },
      "pki-collection-items-2"
    ] as const
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

export const useListPkiCollectionItems = ({
  collectionId,
  offset,
  limit
}: {
  collectionId: string;
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: pkiCollectionKeys.specificPkiCollectionItems({
      collectionId,
      offset,
      limit
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit)
      });

      const {
        data: { collectionItems, totalCount }
      } = await apiRequest.get<{
        collectionItems: TPkiCollectionItem[];
        totalCount: number;
      }>(`/api/v1/pki/collections/${collectionId}/items`, {
        params
      });

      return { collectionItems, totalCount };
    },
    enabled: Boolean(collectionId)
  });
};
