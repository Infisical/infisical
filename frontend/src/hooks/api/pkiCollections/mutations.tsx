import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { workspaceKeys } from "../workspace/queries";
// import { alertKeys } from "./queries";
// import { TAlert, TCreateAlertDTO, TDeleteAlertDTO, TUpdateAlertDTO } from "./types";
import { pkiCollectionKeys } from "./queries";
import {
  TCreatePkiCollectionDTO,
  TDeletePkiCollectionDTO,
  TPkiCollection,
  TUpdatePkiCollectionTO} from "./types";

export const useCreatePkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollection, {}, TCreatePkiCollectionDTO>({
    mutationFn: async (body) => {
      const { data: pkiCollection } = await apiRequest.post<TPkiCollection>(
        "/api/v1/pki/collections",
        body
      );
      return pkiCollection;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspacePkiCollections(projectId));
    }
  });
};

export const useUpdatePkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollection, {}, TUpdatePkiCollectionTO>({
    mutationFn: async ({ collectionId, ...body }) => {
      const { data: pkiCollection } = await apiRequest.patch<TPkiCollection>(
        `/api/v1/pki/collections/${collectionId}`,
        body
      );
      return pkiCollection;
    },
    onSuccess: (_, { projectId, collectionId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspacePkiCollections(projectId));
      queryClient.invalidateQueries(pkiCollectionKeys.getPkiCollectionById(collectionId));
    }
  });
};

export const useDeletePkiCollection = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiCollection, {}, TDeletePkiCollectionDTO>({
    mutationFn: async ({ collectionId }) => {
      const { data: pkiCollection } = await apiRequest.delete<TPkiCollection>(
        `/api/v1/pki/collections/${collectionId}`
      );
      return pkiCollection;
    },
    onSuccess: (_, { projectId, collectionId }) => {
      queryClient.invalidateQueries(workspaceKeys.getWorkspacePkiCollections(projectId));
      queryClient.invalidateQueries(pkiCollectionKeys.getPkiCollectionById(collectionId));
    }
  });
};

// TODO: add PKI Collection Item
