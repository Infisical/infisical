import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

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
    onSuccess: (_, { projectId }) => {
      queryClient.invalidateQueries({
        queryKey: certificateProfileKeys.list({ projectId })
      });
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
    onSuccess: (profile, { profileId }) => {
      queryClient.invalidateQueries({
        queryKey: certificateProfileKeys.list({ projectId: profile.projectId })
      });
      queryClient.invalidateQueries({
        queryKey: certificateProfileKeys.getById(profileId)
      });
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
    onSuccess: (profile, { profileId }) => {
      queryClient.invalidateQueries({
        queryKey: certificateProfileKeys.list({ projectId: profile.projectId })
      });
      queryClient.removeQueries({
        queryKey: certificateProfileKeys.getById(profileId)
      });
    }
  });
};
