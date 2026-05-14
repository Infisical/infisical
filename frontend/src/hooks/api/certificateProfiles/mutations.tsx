import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";
import { pkiApplicationKeys } from "@app/hooks/api/pkiApplications/queries";

import { certificateProfileKeys } from "./queries";
import {
  TCertificateProfile,
  TCreateCertificateProfileDTO,
  TDeleteCertificateProfileDTO,
  TUpdateCertificateProfileDTO
} from "./types";

export const useCreateCertificateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation<TCertificateProfile, object, TCreateCertificateProfileDTO>({
    mutationFn: async (data) => {
      const { data: response } = await apiRequest.post<{
        certificateProfile: TCertificateProfile;
      }>("/api/v1/cert-manager/certificate-profiles", data);
      return response.certificateProfile;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles", "list"]
      });
      queryClient.invalidateQueries({ queryKey: pkiApplicationKeys.all });
    }
  });
};

export const useUpdateCertificateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation<TCertificateProfile, object, TUpdateCertificateProfileDTO>({
    mutationFn: async ({ profileId, ...data }) => {
      const { data: response } = await apiRequest.patch<{
        certificateProfile: TCertificateProfile;
      }>(`/api/v1/cert-manager/certificate-profiles/${profileId}`, data);
      return response.certificateProfile;
    },
    onSuccess: (_, { profileId }) => {
      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles", "list"]
      });
      queryClient.invalidateQueries({
        queryKey: certificateProfileKeys.getById(profileId)
      });
      queryClient.invalidateQueries({ queryKey: pkiApplicationKeys.all });
    }
  });
};

export const useDeleteCertificateProfile = () => {
  const queryClient = useQueryClient();

  return useMutation<TCertificateProfile, object, TDeleteCertificateProfileDTO>({
    mutationFn: async ({ profileId }) => {
      const { data: response } = await apiRequest.delete<{
        certificateProfile: TCertificateProfile;
      }>(`/api/v1/cert-manager/certificate-profiles/${profileId}`);
      return response.certificateProfile;
    },
    onSuccess: (_, { profileId }) => {
      queryClient.invalidateQueries({
        queryKey: ["certificate-profiles", "list"]
      });
      queryClient.removeQueries({
        queryKey: certificateProfileKeys.getById(profileId)
      });
      queryClient.invalidateQueries({ queryKey: pkiApplicationKeys.all });
    }
  });
};
