import { useMutation, useQueryClient } from "@tanstack/react-query";

import { createNotification } from "@app/components/notifications";
import { apiRequest } from "@app/config/request";

import { pkiDiscoveryKeys, pkiInstallationKeys } from "./queries";
import {
  TCreatePkiDiscoveryDTO,
  TDeletePkiDiscoveryDTO,
  TDeletePkiInstallationDTO,
  TPkiDiscovery,
  TPkiInstallation,
  TTriggerPkiDiscoveryScanDTO,
  TTriggerPkiDiscoveryScanResponse,
  TUpdatePkiDiscoveryDTO,
  TUpdatePkiInstallationDTO
} from "./types";

export const useCreatePkiDiscovery = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiDiscovery, object, TCreatePkiDiscoveryDTO>({
    mutationFn: async (body) => {
      const { data } = await apiRequest.post<TPkiDiscovery>(
        "/api/v1/cert-manager/discovery-jobs",
        body
      );
      return data;
    },
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.list(projectId) });
      createNotification({
        text: "Successfully created discovery job",
        type: "success"
      });
    }
  });
};

export const useUpdatePkiDiscovery = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiDiscovery, object, TUpdatePkiDiscoveryDTO>({
    mutationFn: async ({ discoveryId, ...body }) => {
      const { data } = await apiRequest.patch<TPkiDiscovery>(
        `/api/v1/cert-manager/discovery-jobs/${discoveryId}`,
        body
      );
      return data;
    },
    onSuccess: (discovery) => {
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.list(discovery.projectId) });
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.discovery(discovery.id) });
      createNotification({
        text: "Successfully updated discovery job",
        type: "success"
      });
    }
  });
};

export const useDeletePkiDiscovery = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiDiscovery, object, TDeletePkiDiscoveryDTO>({
    mutationFn: async ({ discoveryId }) => {
      const { data } = await apiRequest.delete<TPkiDiscovery>(
        `/api/v1/cert-manager/discovery-jobs/${discoveryId}`
      );
      return data;
    },
    onSuccess: (discovery) => {
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.list(discovery.projectId) });
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.discovery(discovery.id) });
      createNotification({
        text: "Successfully deleted discovery job",
        type: "success"
      });
    }
  });
};

export const useTriggerPkiDiscoveryScan = () => {
  const queryClient = useQueryClient();
  return useMutation<
    TTriggerPkiDiscoveryScanResponse,
    object,
    TTriggerPkiDiscoveryScanDTO & { projectId: string }
  >({
    mutationFn: async ({ discoveryId }) => {
      const { data } = await apiRequest.post<TTriggerPkiDiscoveryScanResponse>(
        `/api/v1/cert-manager/discovery-jobs/${discoveryId}/scan`
      );
      return data;
    },
    onSuccess: (_, { discoveryId, projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.discovery(discoveryId) });
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.latestScan(discoveryId) });
      queryClient.invalidateQueries({ queryKey: pkiDiscoveryKeys.list(projectId) });
      createNotification({
        text: "Scan triggered successfully",
        type: "success"
      });
    }
  });
};

export const useUpdatePkiInstallation = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiInstallation, object, TUpdatePkiInstallationDTO & { projectId: string }>({
    mutationFn: async ({ installationId, ...body }) => {
      const { data } = await apiRequest.patch<TPkiInstallation>(
        `/api/v1/cert-manager/installations/${installationId}`,
        body
      );
      return data;
    },
    onSuccess: (installation, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiInstallationKeys.list(projectId) });
      queryClient.invalidateQueries({
        queryKey: pkiInstallationKeys.installation(installation.id)
      });
      createNotification({
        text: "Successfully updated installation",
        type: "success"
      });
    }
  });
};

export const useDeletePkiInstallation = () => {
  const queryClient = useQueryClient();
  return useMutation<TPkiInstallation, object, TDeletePkiInstallationDTO & { projectId: string }>({
    mutationFn: async ({ installationId }) => {
      const { data } = await apiRequest.delete<TPkiInstallation>(
        `/api/v1/cert-manager/installations/${installationId}`
      );
      return data;
    },
    onSuccess: (installation, { projectId }) => {
      queryClient.invalidateQueries({ queryKey: pkiInstallationKeys.list(projectId) });
      queryClient.invalidateQueries({
        queryKey: pkiInstallationKeys.installation(installation.id)
      });
      createNotification({
        text: "Successfully deleted installation",
        type: "success"
      });
    }
  });
};
