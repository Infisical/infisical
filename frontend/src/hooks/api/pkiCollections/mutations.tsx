import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace";
import { pkiCollectionKeys } from "./queries";
import {
  TAddItemToPkiCollectionDTO,
  TCreatePkiCollectionDTO,
  TDeletePkiCollectionDTO,
  TPkiCollection,
  TPkiCollectionItem,
  TRemoveItemFromPkiCollectionDTO,
  TUpdatePkiCollectionTO
} from "./types";

export const useCreatePkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollection, object, TCreatePkiCollectionDTO>({
    mutationFn: async (body) => {
      const { data: pkiCollection } = await apiRequest.post<TPkiCollection>(
        "/api/v1/pki/collections",
        body
      );
      return pkiCollection;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiCollections(projectId)
      });
    }
  });
};

export const useUpdatePkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollection, object, TUpdatePkiCollectionTO>({
    mutationFn: async ({ collectionId, ...body }) => {
      const { data: pkiCollection } = await apiRequest.patch<TPkiCollection>(
        `/api/v1/pki/collections/${collectionId}`,
        body
      );
      return pkiCollection;
    },
    onSuccess: (_, { projectId, collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiCollections(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiCollectionKeys.getPkiCollectionById(collectionId)
      });
    }
  });
};

export const useDeletePkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollection, object, TDeletePkiCollectionDTO>({
    mutationFn: async ({ collectionId }) => {
      const { data: pkiCollection } = await apiRequest.delete<TPkiCollection>(
        `/api/v1/pki/collections/${collectionId}`
      );
      return pkiCollection;
    },
    onSuccess: (_, { projectId, collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: workspaceKeys.getWorkspacePkiCollections(projectId)
      });
      queryClient.invalidateQueries({
        queryKey: pkiCollectionKeys.getPkiCollectionById(collectionId)
      });
    }
  });
};

export const useAddItemToPkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollectionItem, object, TAddItemToPkiCollectionDTO>({
    mutationFn: async ({ collectionId, type, itemId }) => {
      const { data: pkiCollectionItem } = await apiRequest.post<TPkiCollectionItem>(
        `/api/v1/pki/collections/${collectionId}/items`,
        {
          type,
          itemId
        }
      );
      return pkiCollectionItem;
    },
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: pkiCollectionKeys.getPkiCollectionItems(collectionId)
      });
    }
  });
};

export const useRemoveItemFromPkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollectionItem, object, TRemoveItemFromPkiCollectionDTO>({
    mutationFn: async ({ collectionId, itemId }) => {
      const { data: pkiCollectionItem } = await apiRequest.delete<TPkiCollectionItem>(
        `/api/v1/pki/collections/${collectionId}/items/${itemId}`
      );
      return pkiCollectionItem;
    },
    onSuccess: (_, { collectionId }) => {
      queryClient.invalidateQueries({
        queryKey: pkiCollectionKeys.getPkiCollectionItems(collectionId)
      });
    }
  });
};
