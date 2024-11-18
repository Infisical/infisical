import { useQuery } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { PkiItemType } from "./constants";
import { TPkiCollection, TPkiCollectionItem } from "./types";

export const pkiCollectionKeys = {
  getPkiCollectionById: (collectionId: string) => [{ collectionId }, "pki-collection"] as const,
  getPkiCollectionItems: (collectionId: string) =>
    [{ collectionId }, "pki-collection-items"] as const,
  specificPkiCollectionItems: ({
    collectionId,
    type,
    offset,
    limit
  }: {
    collectionId: string;
    type?: PkiItemType;
    offset: number;
    limit: number;
  }) =>
    [
      ...pkiCollectionKeys.getPkiCollectionItems(collectionId),
      { offset, limit, type },
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
  type,
  offset,
  limit
}: {
  collectionId: string;
  type?: PkiItemType;
  offset: number;
  limit: number;
}) => {
  return useQuery({
    queryKey: pkiCollectionKeys.specificPkiCollectionItems({
      collectionId,
      offset,
      limit,
      type
    }),
    queryFn: async () => {
      const params = new URLSearchParams({
        offset: String(offset),
        limit: String(limit),
        ...(type ? { type } : {})
      });

      const {
        data: { collectionItems, totalCount }
      } = await apiRequest.get<{
        collectionItems: (TPkiCollectionItem & {
          notBefore: string;
          notAfter: string;
          friendlyName: string;
        })[];
        totalCount: number;
      }>(`/api/v1/pki/collections/${collectionId}/items`, {
        params
      });

      return { collectionItems, totalCount };
    },
    enabled: Boolean(collectionId)
  });
};
