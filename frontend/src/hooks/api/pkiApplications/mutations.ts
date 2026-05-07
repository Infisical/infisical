import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiRequest } from "@app/config/request";

import { pkiApplicationKeys } from "./queries";
import {
  TAddPkiApplicationMemberDTO,
  TAttachPkiApplicationProfilesDTO,
  TClearEnrollmentMethodDTO,
  TCreatePkiApplicationDTO,
  TDeletePkiApplicationDTO,
  TDetachPkiApplicationProfileDTO,
  TPkiApplication,
  TPkiApplicationMember,
  TPkiApplicationProfile,
  TPkiApplicationResponse,
  TRemovePkiApplicationMemberDTO,
  TRevealAcmeEabSecretResponse,
  TSetAcmeEnrollmentDTO,
  TSetApiEnrollmentDTO,
  TSetEstEnrollmentDTO,
  TSetScepEnrollmentDTO,
  TUpdatePkiApplicationDTO,
  TUpdatePkiApplicationMemberRoleDTO
} from "./types";

const BASE_URL = "/api/v1/cert-manager/applications";

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) =>
  qc.invalidateQueries({ queryKey: pkiApplicationKeys.all });

export const useCreatePkiApplication = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (dto: TCreatePkiApplicationDTO) => {
      const { data } = await apiRequest.post<TPkiApplicationResponse>(BASE_URL, dto);
      return data.application;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useUpdatePkiApplication = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, ...body }: TUpdatePkiApplicationDTO) => {
      const { data } = await apiRequest.patch<TPkiApplicationResponse>(
        `${BASE_URL}/${applicationId}`,
        body
      );
      return data.application;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useDeletePkiApplication = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId }: TDeletePkiApplicationDTO) => {
      const { data } = await apiRequest.delete<{ application: TPkiApplication }>(
        `${BASE_URL}/${applicationId}`
      );
      return data.application;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useAttachPkiApplicationProfiles = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, ...body }: TAttachPkiApplicationProfilesDTO) => {
      const { data } = await apiRequest.post<{ profiles: TPkiApplicationProfile[] }>(
        `${BASE_URL}/${applicationId}/profiles`,
        body
      );
      return data.profiles;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useDetachPkiApplicationProfile = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId }: TDetachPkiApplicationProfileDTO) => {
      const { data } = await apiRequest.delete<{ applicationId: string; profileId: string }>(
        `${BASE_URL}/${applicationId}/profiles/${profileId}`
      );
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

const memberPathSegment = (kind: "user" | "identity" | "group") => {
  if (kind === "user") return "users";
  if (kind === "identity") return "identities";
  return "groups";
};

export const useAddPkiApplicationMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, kind, memberId, role }: TAddPkiApplicationMemberDTO) => {
      const { data } = await apiRequest.post<{ membership: TPkiApplicationMember }>(
        `${BASE_URL}/${applicationId}/${memberPathSegment(kind)}/${memberId}`,
        { role }
      );
      return data.membership;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useAddPkiApplicationUserMembers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      applicationId,
      userIds,
      emails,
      role
    }: {
      applicationId: string;
      userIds?: string[];
      emails?: string[];
      role: string;
    }) => {
      const { data } = await apiRequest.post<{
        memberships: TPkiApplicationMember[];
        skipped: string[];
        unresolved: string[];
      }>(`${BASE_URL}/${applicationId}/users`, {
        userIds: userIds ?? [],
        emails: emails ?? [],
        role
      });
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useUpdatePkiApplicationMemberRole = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      applicationId,
      kind,
      memberId,
      role
    }: TUpdatePkiApplicationMemberRoleDTO) => {
      const { data } = await apiRequest.patch<{ membership: TPkiApplicationMember }>(
        `${BASE_URL}/${applicationId}/${memberPathSegment(kind)}/${memberId}`,
        { role }
      );
      return data.membership;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useRemovePkiApplicationMember = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, kind, memberId }: TRemovePkiApplicationMemberDTO) => {
      const { data } = await apiRequest.delete<{
        membershipId: string;
        applicationId: string;
      }>(`${BASE_URL}/${applicationId}/${memberPathSegment(kind)}/${memberId}`);
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

const enrollmentBase = (applicationId: string, profileId: string) =>
  `${BASE_URL}/${applicationId}/profiles/${profileId}/enrollment`;

export const useSetPkiApplicationApiEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId, ...body }: TSetApiEnrollmentDTO) => {
      const { data } = await apiRequest.put(
        `${enrollmentBase(applicationId, profileId)}/api`,
        body
      );
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useClearPkiApplicationApiEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId }: TClearEnrollmentMethodDTO) => {
      const { data } = await apiRequest.delete(`${enrollmentBase(applicationId, profileId)}/api`);
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useSetPkiApplicationEstEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId, ...body }: TSetEstEnrollmentDTO) => {
      const { data } = await apiRequest.put(
        `${enrollmentBase(applicationId, profileId)}/est`,
        body
      );
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useClearPkiApplicationEstEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId }: TClearEnrollmentMethodDTO) => {
      const { data } = await apiRequest.delete(`${enrollmentBase(applicationId, profileId)}/est`);
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useSetPkiApplicationAcmeEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId, ...body }: TSetAcmeEnrollmentDTO) => {
      const { data } = await apiRequest.put(
        `${enrollmentBase(applicationId, profileId)}/acme`,
        body
      );
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useClearPkiApplicationAcmeEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId }: TClearEnrollmentMethodDTO) => {
      const { data } = await apiRequest.delete(`${enrollmentBase(applicationId, profileId)}/acme`);
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useRevealPkiApplicationAcmeEabSecret = () => {
  return useMutation({
    mutationFn: async ({ applicationId, profileId }: TClearEnrollmentMethodDTO) => {
      const { data } = await apiRequest.post<TRevealAcmeEabSecretResponse>(
        `${enrollmentBase(applicationId, profileId)}/acme/eab/reveal`
      );
      return data;
    }
  });
};

export const useRotatePkiApplicationAcmeEabSecret = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId }: TClearEnrollmentMethodDTO) => {
      const { data } = await apiRequest.post(
        `${enrollmentBase(applicationId, profileId)}/acme/eab/rotate`
      );
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useSetPkiApplicationScepEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId, ...body }: TSetScepEnrollmentDTO) => {
      const { data } = await apiRequest.put(
        `${enrollmentBase(applicationId, profileId)}/scep`,
        body
      );
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};

export const useClearPkiApplicationScepEnrollment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ applicationId, profileId }: TClearEnrollmentMethodDTO) => {
      const { data } = await apiRequest.delete(`${enrollmentBase(applicationId, profileId)}/scep`);
      return data;
    },
    onSuccess: () => invalidateAll(qc)
  });
};
